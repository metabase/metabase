import "./commands/ui/button";
import "./commands/ui/icon";

import "./commands/api/index";
import "./commands/api/alert";
import "./commands/api/dashboardCard";
import "./commands/api/moderation";
import "./commands/api/pulse";
import "./commands/api/user";
import "./commands/api/timeline";

import "./commands/api/composite/createNativeQuestionAndDashboard";
import "./commands/api/composite/createQuestionAndAddToDashboard";
import "./commands/api/composite/createDashboardWithQuestions";
import "./commands/api/composite/createTimelineWithEvents";

import "./commands/user/createUser";
import "./commands/user/authentication";

import "./commands/permissions/updatePermissions";
import "./commands/permissions/sandboxTable";

import "./commands/database/addSQLiteDatabase";

import "./commands/visibility/isVisibleInPopover";
import "./commands/visibility/findByTextEnsureVisible";
import "./commands/visibility/isRenderedWithinViewport";

import "./commands/overwrites/log";

require("./commands/downloads/downloadUtils").addCustomCommands();
