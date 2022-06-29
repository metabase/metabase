import { BaseUser } from "./user";

export interface Revision {
  description: string;
  id: number;
  is_creation: boolean;
  is_reversion: boolean;
  message?: string | null;
  user: BaseUser;
  diff: { before: object; after: object };
  timestamp: string;
}
