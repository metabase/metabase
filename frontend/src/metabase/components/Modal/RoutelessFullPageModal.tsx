// the "routeless" version should only be used for non-inline modals
import { FullPageModal } from "metabase/components/Modal/FullPageModal";
import routeless from "metabase/hoc/Routeless";

export const RoutelessFullPageModal = routeless(FullPageModal);
