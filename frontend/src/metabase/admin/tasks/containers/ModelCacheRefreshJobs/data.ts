import { ModelCacheRefreshJob } from "./types";

function hoursAgo(hours: number) {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toUTCString();
}

function fakeUser(id: number, common_name: string) {
  const [first_name, last_name] = common_name.split(" ");
  return {
    id,
    first_name,
    last_name,
    common_name,
    email: `${first_name.toLowerCase()}.${last_name.toLowerCase()}@metabase.test`,
    is_active: true,
    is_qbnewb: false,
    is_superuser: false,
    date_joined: "",
    last_login: "",
  };
}

const data: ModelCacheRefreshJob[] = [
  {
    id: 1,
    status: "completed",
    model: {
      id: 1,
      name: "Customer",
      collection: {
        id: null,
        name: "Our analytics",
      },
    },
    last_run_trigger: "scheduled",
    last_run_at: hoursAgo(3),
    creator: fakeUser(1, "John Lennon"),
    updated_by: fakeUser(2, "Paul McCartney"),
  },
  {
    id: 2,
    status: "completed",
    model: {
      id: 2,
      name: "Release",
      collection: {
        id: 4,
        name: "Engineering",
      },
    },
    last_run_trigger: "api",
    last_run_at: hoursAgo(28),
    creator: fakeUser(3, "John Carmack"),
    updated_by: fakeUser(4, "John Romero"),
  },
  {
    id: 3,
    status: "error",
    model: {
      id: 3,
      name: "Subscription",
      collection: {
        id: 14,
        name: "Growth",
      },
    },
    last_run_trigger: "scheduled",
    last_run_at: hoursAgo(24 * 8),
    creator: fakeUser(5, "Luke Skywalker"),
    updated_by: fakeUser(5, "Luke Skywalker"),
  },
];

export default data;
