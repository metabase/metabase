import Settings from "metabase/lib/settings";

export const getGroups = (state, { pulses }) => {
  const items = pulses.map(pulse => ({ item: pulse, type: "pulse" }));
  items.sort((a, b) => b.item.created_at - a.item.created_at);
  return items;
};

export const getAdminEmail = () => {
  return Settings.get("admin-email");
};
