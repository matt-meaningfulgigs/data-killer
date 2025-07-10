import { z } from "zod";

export const UserSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  phone: z.string(),
  dateOfBirth: z.string(),
  additionalNotes: z.string().optional(),
});

export const BrokerSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  opt_out_url: z.string().url(),
  requires_id_upload: z.boolean(),
  notes: z.string(),
});

export const BrokersArraySchema = z.array(BrokerSchema);

export type User = z.infer<typeof UserSchema>;
export type Broker = z.infer<typeof BrokerSchema>;

export interface RemovalResult {
  broker: Broker;
  success: boolean;
  error?: string;
  timestamp: Date;
  details?: string;
}

export interface RemovalSession {
  user: User;
  results: RemovalResult[];
  startTime: Date;
  endTime?: Date;
} 
