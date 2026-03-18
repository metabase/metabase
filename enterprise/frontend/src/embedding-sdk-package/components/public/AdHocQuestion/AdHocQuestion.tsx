import { createComponent } from "embedding-sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * A component that renders an ad-hoc question from a base64-encoded MBQL query.
 *
 * @internal Not part of the public API yet. Do not use in external integrations.
 * @function
 * @category AdHocQuestion
 * @param props
 */
export const AdHocQuestion = createComponent(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.AdHocQuestion,
);
