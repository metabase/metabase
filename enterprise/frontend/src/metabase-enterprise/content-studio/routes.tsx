import { NotFound } from "metabase/common/components/ErrorPages";
import { Navigate, Route } from "metabase/router";
import {
  NewCardTransformPage,
  NewNativeTransformPage,
  NewQueryTransformPage,
} from "metabase/transforms/pages/NewTransformPage";
import { TransformIndexesPage } from "metabase/transforms/pages/TransformIndexesPage";
import { TransformQueryPage } from "metabase/transforms/pages/TransformQueryPage";
import { TransformRunPage } from "metabase/transforms/pages/TransformRunPage";
import { TransformSettingsPage } from "metabase/transforms/pages/TransformSettingsPage";
import * as Urls from "metabase/urls";
import { ArchivedSnippetsPage } from "metabase-enterprise/data-studio/library/snippets/pages/ArchivedSnippetsPage";
import { NewSnippetPage } from "metabase-enterprise/data-studio/library/snippets/pages/NewSnippetPage";

import { ContentStudioCollectionPage } from "./pages/ContentStudioCollectionPage";
import { ContentStudioEditSnippetPage } from "./pages/ContentStudioEditSnippetPage";
import { ContentStudioQuestionPage } from "./pages/ContentStudioQuestionPage";
import { ContentStudioRootPage } from "./pages/ContentStudioRootPage";
import { ContentStudioSnippetsLayout } from "./pages/ContentStudioSnippetsLayout";
import { ContentStudioTransformLayout } from "./pages/ContentStudioTransformLayout";
import { ContentStudioTransformsLayout } from "./pages/ContentStudioTransformsLayout";

export function getContentStudioContentRoutes() {
  return (
    <>
      <Route
        index
        element={<Navigate to={Urls.contentStudioCollections()} replace />}
      />
      <Route
        path="collections"
        element={<ContentStudioRootPage section="collections" />}
      />
      <Route
        path="collection/:slug"
        element={<ContentStudioCollectionPage />}
      />
      <Route path="question/:cardId" element={<ContentStudioQuestionPage />} />
      <Route path="transforms" element={<ContentStudioTransformsLayout />}>
        <Route index element={<ContentStudioRootPage section="transforms" />} />
        <Route path="new/query" element={<NewQueryTransformPage />} />
        <Route path="new/native" element={<NewNativeTransformPage />} />
        <Route path="new/card/:cardId" element={<NewCardTransformPage />} />
        <Route path=":transformId" element={<ContentStudioTransformLayout />}>
          <Route index element={<TransformQueryPage />} />
          <Route path="edit" element={<TransformQueryPage />} />
          <Route path="run" element={<TransformRunPage />} />
          <Route path="settings" element={<TransformSettingsPage />} />
          <Route path="indexes" element={<TransformIndexesPage />} />
        </Route>
      </Route>
      <Route path="snippets" element={<ContentStudioSnippetsLayout />}>
        <Route index element={<ContentStudioRootPage section="snippets" />} />
        <Route path="new" element={<NewSnippetPage />} />
        <Route path="archived" element={<ArchivedSnippetsPage />} />
        <Route path=":snippetId" element={<ContentStudioEditSnippetPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </>
  );
}
