import { color, lighten } from "metabase/lib/colors";

export const getDefaultSearchColor = () => lighten(color("nav"), 0.07);

export const APP_BAR_HEIGHT = "60px";
export const ADMIN_NAVBAR_HEIGHT = "65px";
