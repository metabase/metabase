export interface User {
  id: number;
  first_name: string;
  is_superuser: boolean;
  has_invited_second_user: boolean;
  personal_collection_id: number;
}
