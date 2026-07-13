import { Navigate, useLocation, useParams } from "metabase/router";

/**
 * Redirects the deprecated `/q` and `/card/:slug` routes to `/question`,
 * preserving the hash that holds the serialized question. A plain `<Redirect>`
 * would drop it.
 */
export function QuestionHashRedirect() {
  const { hash } = useLocation();
  const { slug } = useParams();
  const pathname = slug ? `/question/${slug}` : "/question";

  return <Navigate to={{ pathname, hash }} replace />;
}
