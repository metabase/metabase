import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  type OnInit,
} from "@angular/core";
import { ActivatedRoute, RouterModule } from "@angular/router";
import {
  InteractiveQuestion,
  MetabaseProvider,
} from "@metabase/embedding-sdk-react";
import type { ReactElement } from "react";

import { metabaseProviderAuthConfig } from "./app.config";
import { ReactMountDirective } from "./react‐mount.directive";

@Component({
  standalone: true,
  selector: "app-interactive-question-page",
  imports: [ReactMountDirective, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span [reactMount]="reactElement"></span> ',
})
export class InteractiveQuestionPageComponent implements OnInit {
  locale = "en";

  defaultQuestionId = 24;
  questionId = this.defaultQuestionId;

  constructor(@Inject(ActivatedRoute) private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.queryParamMap.subscribe((params) => {
      const locale = params.get("locale");
      const rawQuestionId = params.get("questionId");

      this.locale = locale;
      this.questionId =
        rawQuestionId !== null ? Number(rawQuestionId) : this.defaultQuestionId;
    });
  }

  public reactElement = (): ReactElement => {
    return (
      <MetabaseProvider
        authConfig={metabaseProviderAuthConfig}
        locale={this.locale}
      >
        <InteractiveQuestion questionId={this.questionId} />
      </MetabaseProvider>
    );
  };
}
