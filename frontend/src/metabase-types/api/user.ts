export interface User {
  id: number;
  common_name: string;
  first_name: string;
  last_name: string;
  email: string;
  google_auth: boolean;
  is_active: boolean;
  is_qbnewb: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_login: string;
  has_invited_second_user: boolean;
  personal_collection_id: number;
  can_access_data_model: boolean;
  can_access_database_management: boolean;
}
