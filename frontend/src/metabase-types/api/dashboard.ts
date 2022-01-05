export interface Dashboard {
  id: number;
  name: string;
  model?: string;
}

export const createDashboard = (opts?: Partial<Dashboard>): Dashboard => ({
  id: 1,
  name: "Dashboard",
  ...opts,
});
