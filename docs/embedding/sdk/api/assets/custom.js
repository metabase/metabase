const GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY = "generatedDocReturnUrl";

const isEmbeddingSdkApiDocsPage = (href) =>
  href.includes("/embedding/sdk/api/");

const storeReturnUrl = () => {
  const ref = document.referrer;

  const isRefFromNonApiPage = ref && !isEmbeddingSdkApiDocsPage(ref);

  if (isRefFromNonApiPage) {
    sessionStorage.setItem(GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY, ref);
  }
};

/**
 * Called from `navigationLinks` field of `typedoc.config.mjs
 */
// eslint-disable-next-line no-unused-vars
const navigateBack = ({ fallbackUrl }) => {
  const returnUrl = sessionStorage.getItem(
    GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY,
  );

  if (returnUrl) {
    sessionStorage.removeItem(GENERATED_DOC_RETURN_URL_LOCAL_STORAGE_KEY);

    location.href = returnUrl;
  } else {
    location.href = fallbackUrl;
  }
};

const init = () => {
  storeReturnUrl();
};

document.addEventListener("DOMContentLoaded", init);
