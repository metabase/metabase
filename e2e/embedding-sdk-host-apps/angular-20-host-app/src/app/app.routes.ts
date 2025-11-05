import type { Routes } from "@angular/router";

import { InteractiveDashboardPageComponent } from "./interactive-dashboard-page.component";
import { InteractiveQuestionPageComponent } from "./interactive-question-page.component";

export const routes: Routes = [
  { path: "interactive-question", component: InteractiveQuestionPageComponent },
  {
    path: "interactive-dashboard",
    component: InteractiveDashboardPageComponent,
  },
];
