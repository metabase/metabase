import fitViewPort from "metabase/hoc/FitViewPort";

import { withLogoBackground } from "metabase/hoc/Background";

// Auth components expect a full viewport experience to center most of the pages
const AuthApp = ({ children }) => children;

export default withLogoBackground(fitViewPort(AuthApp));
