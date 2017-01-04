
export const getUser = (state) =>
    state.currentUser;

export const getUserIsAdmin = (state) =>
    (getUser(state) || {}).is_superuser || false;
