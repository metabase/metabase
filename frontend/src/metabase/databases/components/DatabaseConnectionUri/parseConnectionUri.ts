export interface UriFields {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  protocol: string;
  searchParams: Record<string, string>;
}

export function parseConnectionUri(connectionUri: string): UriFields | null {
  try {
    const {
      hostname,
      port,
      pathname,
      username,
      password,
      protocol,
      searchParams,
    } = new URL(connectionUri);

    const searchParamsObject = Object.fromEntries(
      Array.from(searchParams.entries()).map(([key, value]) => [
        key,
        decodeURIComponent(value),
      ]),
    );

    return {
      host: hostname,
      port,
      database: pathname.slice(1),
      username,
      password,
      protocol: protocol.slice(0, -1), // remove trailing colon
      searchParams: searchParamsObject,
    };
  } catch (error) {
    return null;
  }
}
