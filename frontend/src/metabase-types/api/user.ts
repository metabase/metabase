export type UserId = number;

export interface User {
  id: UserId;
  first_name: string;
  last_name: string;
  common_name: string;
  email: string;
  google_auth: boolean;
  is_active: boolean;
  is_qbnewb: boolean;
  is_superuser: boolean;
  is_installer: boolean;
  has_invited_second_user: boolean;
  has_question_and_dashboard: boolean;
  date_joined: string;
  first_login: string;
  last_login: string;
  personal_collection_id: number;
}
