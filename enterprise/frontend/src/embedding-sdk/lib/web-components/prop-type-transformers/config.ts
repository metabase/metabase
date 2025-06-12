import { idTransformer } from "./id-transformer";
import type { CustomPropTypeTransformersMap } from "./types";

export const propTypeTransformers: CustomPropTypeTransformersMap = {
  id: idTransformer,
};
