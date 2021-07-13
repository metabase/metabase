import { PLUGIN_MODERATION } from "metabase/plugins";
import ModerationActions from "./components/ModerationActions/ModerationActions";
import { verifyItem } from "./service";

Object.assign(PLUGIN_MODERATION, {
  ModerationActions,
  verifyItem,
});
