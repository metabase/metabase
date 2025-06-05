import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  type OnInit,
} from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import {
  InteractiveDashboard,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";
import type { ReactElement } from "react";

import { metabaseProviderAuthConfig } from "./app.config";
import { ReactMountDirective } from "./react‐mount.directive";

@Component({
  standalone: true,
  selector: "app-interactive-dashboard-page",
  imports: [ReactMountDirective, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span [reactMount]="reactElement"></span> ',
})
export class InteractiveDashboardPageComponent implements OnInit {
  locale = "en";

  defaultDashboardId = 1;
  dashboardId = this.defaultDashboardId;

  constructor(@Inject(ActivatedRoute) private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.queryParamMap.subscribe((params) => {
      const locale = params.get("locale");
      const rawDashboardId = params.get("dashboardId");

      this.locale = locale;
      this.dashboardId =
        rawDashboardId !== null ? Number(rawDashboardId) : this.dashboardId;
    });
  }

  public reactElement = (): ReactElement => {
    return (
      <MetabaseProvider
        authConfig={metabaseProviderAuthConfig}
        locale={this.locale}
      >
        <InteractiveDashboard dashboardId={this.dashboardId} withDownloads />
      </MetabaseProvider>
    );
  };
}
