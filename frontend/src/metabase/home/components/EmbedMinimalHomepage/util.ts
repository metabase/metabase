export const setShowEmbedHomepageFlag = () => {
  try {
    localStorage.setItem("showEmbedHomepage", "true");
  } catch (e) {
    console.error(e);
  }
};

export const removeShowEmbedHomepageFlag = () => {
  try {
    localStorage.removeItem("showEmbedHomepage");
  } catch (e) {
    console.error(e);
  }
};

export const shouldSHowEmbedHomepage = () => {
  try {
    return localStorage.getItem("showEmbedHomepage") === "true";
  } catch (e) {
    return false;
  }
};
