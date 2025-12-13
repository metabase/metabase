import type { Params } from "react-router/lib/Router";

import { useRouter } from "./useRouter";

export const useParams = <TParams extends Params = Params>(): TParams =>
  useRouter<TParams>().params;
