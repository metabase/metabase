import type { LocationDescriptor } from "history";
import { useEffect, useMemo, useRef } from "react";
import {
  useLocation,
  useMatches,
  useNavigate,
  useParams,
} from "react-router-dom";

export const useRouter = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<Record<string, string | undefined>>();
  const matches = useMatches();
  const listenersRef = useRef(new Set<(location: any) => void>());

  const query = useMemo(() => {
    const result: Record<string, string> = {};
    const searchParams = new URLSearchParams(location.search);
    searchParams.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }, [location.search]);

  const compatLocation = useMemo(
    () => ({
      ...location,
      query,
      action: "PUSH",
    }),
    [location, query],
  );

  useEffect(() => {
    listenersRef.current.forEach((listener) => listener(compatLocation));
  }, [compatLocation]);

  const routes = matches.map((match) => {
    const route = (match as { route?: Record<string, unknown> }).route;
    if (route) {
      return {
        ...route,
        path: typeof route.path === "string" ? route.path : match.pathname,
      };
    }

    return { path: match.pathname };
  });

  const toLocationDescriptor = (nextLocation: LocationDescriptor) => {
    if (typeof nextLocation === "string") {
      return nextLocation;
    }

    const pathname = nextLocation.pathname ?? location.pathname;
    const hash = nextLocation.hash ?? "";
    const state = nextLocation.state;

    let search = nextLocation.search ?? "";
    if ("query" in nextLocation && nextLocation.query != null) {
      const searchParams = new URLSearchParams(
        Object.entries(nextLocation.query).reduce<Record<string, string>>(
          (acc, [key, value]) => {
            if (value != null) {
              acc[key] = String(value);
            }
            return acc;
          },
          {},
        ),
      );
      const queryString = searchParams.toString();
      search = queryString ? `?${queryString}` : "";
    }

    return {
      pathname,
      search,
      hash,
      state,
    };
  };

  return {
    router: {
      push: (nextLocation: LocationDescriptor) =>
        navigate(toLocationDescriptor(nextLocation)),
      replace: (nextLocation: LocationDescriptor) =>
        navigate(toLocationDescriptor(nextLocation), { replace: true }),
      goBack: () => navigate(-1),
      goForward: () => navigate(1),
      go: (n: number) => navigate(n),
      listen: (handler: (location: any) => void) => {
        listenersRef.current.add(handler);
        return () => listenersRef.current.delete(handler);
      },
      setRouteLeaveHook: () => () => undefined,
    },
    location: compatLocation,
    params,
    routes,
  };
};
