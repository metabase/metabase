import { PLUGIN_TRANSFORMS } from "metabase/plugins";

import { NewTransformModal } from "./components/NewTransformModal";
import { TransformSection } from "./components/TransformSection";
import { useFetchTransforms } from "./hooks/use-fetch-transforms";

PLUGIN_TRANSFORMS.useFetchTransforms = useFetchTransforms;
PLUGIN_TRANSFORMS.TransformSection = TransformSection;
PLUGIN_TRANSFORMS.NewTransformModal = NewTransformModal;
