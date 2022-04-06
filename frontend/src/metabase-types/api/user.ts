export interface BaseUser {
  id: number;
  first_name: string;
  last_name: string;
  common_name: string;
  email: string;

  is_active: boolean;
  is_qbnewb: boolean;
  is_superuser: boolean;

  date_joined: string;
  last_login: string;
}

export interface User extends BaseUser {
  google_auth: boolean;
  is_installer: boolean;
  has_invited_second_user: boolean;
  has_question_and_dashboard: boolean;
  personal_collection_id: number;
}
