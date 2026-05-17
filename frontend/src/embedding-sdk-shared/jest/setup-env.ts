import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

process.env.IS_EMBEDDING_SDK = "true";

EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

if (typeof SVGElement !== "undefined" && !SVGElement.prototype.getBBox) {
  SVGElement.prototype.getBBox = () => ({
    x: 0,
    y: 0,
    width: 100,
    height: 20,
  });
}
