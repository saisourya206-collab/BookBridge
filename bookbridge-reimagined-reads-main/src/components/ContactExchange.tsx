import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Phone, MapPin, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ContactExchangeProps {
  requestId: string;
  isOpen: boolean;
  onClose: () => void;
  isDonor: boolean;
  onExchangeComplete: () => void;
}

interface ExchangeStatus {
  donor_phone?: string | null;
  donor_address?: string | null;
  requester_phone?: string | null;
  requester_address?: string | null;
  status?: string | null;
}

export const ContactExchange: React.FC<ContactExchangeProps> = ({
  requestId,
  isOpen,
  onClose,
  isDonor,
  onExchangeComplete
}) => {
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [exchangeStatus, setExchangeStatus] = useState<ExchangeStatus | null>(null);
  const { toast } = useToast();

  const fetchExchangeStatus = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('contact_exchanges')
        .select('*')
        .eq('request_id', requestId)
        .single();

      setExchangeStatus(data);
    } catch (error) {
      console.error('Error fetching exchange status:', error);
    }
  }, [requestId]);

  useEffect(() => {
    if (isOpen) {
      fetchUserProfile();
      fetchExchangeStatus();
    }
  }, [isOpen, requestId, fetchExchangeStatus]);

  const fetchUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('phone, address')
        .eq('id', user.id)
        .single();

      if (data) {
        setPhone((data as { phone?: string; address?: string }).phone || '');
        setAddress((data as { phone?: string; address?: string }).address || '');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const handleSubmitContact = async () => {
    if (!phone.trim() || !address.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both phone number and address.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('profiles')
        .update({ phone, address })
        .eq('id', user.id);

      const updateData = isDonor
        ? { donor_phone: phone, donor_address: address }
        : { requester_phone: phone, requester_address: address };

      const { data: existing } = await supabase
        .from('contact_exchanges')
        .select('*')
        .eq('request_id', requestId)
        .single();

      if (existing) {
        await supabase
          .from('contact_exchanges')
          .update(updateData)
          .eq('request_id', requestId);
      } else {
        await supabase
          .from('contact_exchanges')
          .insert({
            request_id: requestId,
            ...updateData
          });
      }

      const { data: request } = await supabase
        .from('book_requests')
        .select('*, books(title)')
        .eq('id', requestId)
        .single();

      if (request) {
        const otherUserId = isDonor ? request.requester_id : request.donor_id;

        const { data: currentUserProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        const currentUserName = (currentUserProfile as { full_name?: string } | null)?.full_name || 'Someone';

        await supabase.rpc('create_book_notification', {
          user_id: otherUserId,
          notification_type: 'contact_shared',
          notification_title: 'Contact Details Shared',
          notification_message: `${currentUserName} has shared their contact details for "${(request.books as { title?: string } | null)?.title}".`
        });
      }

      const { data: exchange } = await supabase
        .from('contact_exchanges')
        .select('*')
        .eq('request_id', requestId)
        .single();

      const exchangeData = exchange as ExchangeStatus | null;
      if (exchangeData && exchangeData.donor_phone && exchangeData.requester_phone) {
        await supabase
          .from('contact_exchanges')
          .update({ status: 'completed' })
          .eq('request_id', requestId);

        onExchangeComplete();
      }

      toast({
        title: "Contact Details Shared",
        description: "Your contact information has been shared successfully.",
      });

      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred.';
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const hasSharedDetails = isDonor
    ? exchangeStatus?.donor_phone
    : exchangeStatus?.requester_phone;

  const otherPartyShared = isDonor
    ? exchangeStatus?.requester_phone
    : exchangeStatus?.donor_phone;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Contact Details</DialogTitle>
        </DialogHeader>

        {hasSharedDetails ? (
          <div className="space-y-4">
            <div className="flex items-center text-green-600">
              <CheckCircle className="h-5 w-5 mr-2" />
              <span>You have already shared your contact details</span>
            </div>

            {otherPartyShared ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Other Party's Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center">
                    <Phone className="h-4 w-4 mr-2" />
                    <span className="text-sm">{isDonor ? exchangeStatus?.requester_phone : exchangeStatus?.donor_phone}</span>
                  </div>
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-2" />
                    <span className="text-sm">{isDonor ? exchangeStatus?.requester_address : exchangeStatus?.donor_address}</span>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">
                Waiting for the other party to share their contact details...
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Please share your contact details to coordinate the book exchange.
            </p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Your phone number"
                />
              </div>

              <div>
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Your address for pickup/delivery"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSubmitContact} disabled={loading}>
                {loading ? 'Sharing...' : 'Share Details'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
