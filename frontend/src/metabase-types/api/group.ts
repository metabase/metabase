export type GroupId = number;

export type Member = {
  user_id: number;
  group_id: number;
  membership_id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_group_manager?: boolean;
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
