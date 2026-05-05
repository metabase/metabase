export const generateKey = <Query>(query?: Query) =>
  JSON.stringify(query ?? "root");
