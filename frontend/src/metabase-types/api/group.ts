import type { User } from "./user";

export type GroupId = number;

export type Membership = {
  user_id: number;
  group_id: number;
  membership_id: number;
  is_group_manager?: boolean;
};

export type Member = {
  user_id: number;
  group_id: number;
  membership_id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_group_manager?: boolean;
  is_superuser: boolean;
};

export type Group = {
  id: GroupId;
  members: Member[];
  name: string;
  member_count: number;
};

export type GroupListQuery = Omit<Group, "members">;

export type BaseGroupInfo = {
  id: GroupId;
  name: string;
};

export type ListUserMembershipsResponse = Record<User["id"], Membership[]>;

export type CreateMembershipRequest = {
  user_id: User["id"];
  group_id: GroupId;
};
