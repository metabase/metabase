import { SimpleDataPicker } from "embedding-sdk/components/private/SimpleDataPicker";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import {
  hasPremiumFeature,
  hasPremiumFeatureAsync,
} from "metabase-enterprise/settings";

if (hasPremiumFeature("embedding_sdk")) {
  PLUGIN_EMBEDDING_SDK.isEnabled = () => true;
}

hasPremiumFeatureAsync("embedding_sdk", () => {
  PLUGIN_EMBEDDING_SDK.SimpleDataPicker = SimpleDataPicker;
});
