import type { Location } from "history";

import { useRouter } from "./useRouter";

export const useLocation = (): Location => useRouter().location;
