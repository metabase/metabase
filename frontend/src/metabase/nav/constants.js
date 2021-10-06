import { color, lighten } from "metabase/lib/colors";

export const getDefaultSearchColor = () => lighten(color("nav"), 0.07);
