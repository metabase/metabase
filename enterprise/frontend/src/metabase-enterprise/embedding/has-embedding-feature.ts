import { hasPremiumFeature } from "metabase-enterprise/settings";

export const hasEmbeddingFeature = () => hasPremiumFeature("embedding");
