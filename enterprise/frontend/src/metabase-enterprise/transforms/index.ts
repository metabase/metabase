import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";

import { NewTransformModal } from "./components/NewTransformModal";
import { TransformSection } from "./components/TransformSection";
import { useLazyListTransforms } from "./hooks/use-lazy-list-transforms";

PLUGIN_TRANSFORMS.canAccessTransforms = getUserIsAdmin;
PLUGIN_TRANSFORMS.useLazyListTransforms = useLazyListTransforms;
PLUGIN_TRANSFORMS.TransformSection = TransformSection;
PLUGIN_TRANSFORMS.NewTransformModal = NewTransformModal;
