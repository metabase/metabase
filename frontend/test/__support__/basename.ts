import { getBasename, setBasename } from "metabase/utils/basename";

/**
 * Set the app basename for the duration of a `describe` block.
 *
 * Call inside a `describe` block — it registers beforeEach/afterEach hooks
 * that apply the given basename and restore the original afterward.
 */
export function setupBasename(basename = "") {
  let originalBasename = "";

  beforeEach(() => {
    originalBasename = getBasename();
    setBasename(basename);
  });

  afterEach(() => {
    setBasename(originalBasename);
  });
}
