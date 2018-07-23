export function isDefaultGroup(group) {
  return group.name === "All Users";
}

export function isAdminGroup(group) {
  return group.name === "Administrators";
}

export function isMetaBotGroup(group) {
  return group.name === "MetaBot";
}

export function canEditPermissions(group) {
  return !isAdminGroup(group);
}

export function canEditMembership(group) {
  return !isDefaultGroup(group);
}

export function getGroupColor(group) {
  return isAdminGroup(group)
    ? "text-purple"
    : isDefaultGroup(group) ? "text-medium" : "text-brand";
}
