export type UserId = number;

export interface BaseUser {
  id: UserId;
  // XXX: Make this optional
  first_name: string;
  // XXX: Make this optional
  last_name: string;
  common_name: string;
  email: string;
  locale: string | null;
  google_auth: boolean;
  is_active: boolean;
  is_qbnewb: boolean;
  is_superuser: boolean;

  date_joined: string;
  last_login: string;
  first_login: string;
}

export interface User extends BaseUser {
  google_auth: boolean;
  is_installer: boolean;
  has_invited_second_user: boolean;
  has_question_and_dashboard: boolean;
  personal_collection_id: number;
}
