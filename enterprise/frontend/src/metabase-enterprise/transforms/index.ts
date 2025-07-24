import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";

import { NewTransformPage } from "./pages/NewTransformPage";
import { TransformListPage } from "./pages/TransformListPage";
import { TransformQueryPage } from "./pages/TransformQueryPage";

PLUGIN_TRANSFORMS.canAccessTransforms = getUserIsAdmin;
PLUGIN_TRANSFORMS.NewTransformPage = NewTransformPage;
PLUGIN_TRANSFORMS.TransformListPage = TransformListPage;
PLUGIN_TRANSFORMS.TransformQueryPage = TransformQueryPage;
