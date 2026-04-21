import "cypress-iframe";

// this is the only place we allow direct helper import
// eslint-disable-next-line metabase/no-direct-helper-import
import { H } from "e2e/support";

import "./commands/ui/button";
import "./commands/ui/icon";
import "./commands/ui/paste";

import "./commands/user/createUser";
import "./commands/user/authentication";

import "./commands/permissions/updatePermissions";
import "./commands/permissions/sandboxTable";

import "./commands/database/addSQLiteDatabase";

import "./commands/visibility/isVisibleInPopover";
import "./commands/visibility/findByTextEnsureVisible";
import "./commands/visibility/isRenderedWithinViewport";

import "./commands/overwrites/log";

import "./commands/component";

import { addCustomCommands } from "./commands/downloads/downloadUtils";
addCustomCommands();

cy.H = { ...H };
