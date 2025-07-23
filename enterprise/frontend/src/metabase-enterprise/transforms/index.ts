import { PLUGIN_TRANSFORMS } from "metabase/plugins";

import { TransformSection } from "./components/TransformSection";
import { useFetchTransforms } from "./hooks/use-fetch-transforms";

PLUGIN_TRANSFORMS.useFetchTransforms = useFetchTransforms;
PLUGIN_TRANSFORMS.TransformSection = TransformSection;
