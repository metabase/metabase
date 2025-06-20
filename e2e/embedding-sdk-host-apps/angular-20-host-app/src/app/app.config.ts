import {
  type ApplicationConfig,
  provideZonelessChangeDetection,
} from "@angular/core";
import { provideRouter } from "@angular/router";
import { defineMetabaseAuthConfig } from "@metabase/embedding-sdk-react";

import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), provideRouter(routes)],
};

export const metabaseProviderAuthConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: `http://localhost:${process.env.NG_APP_MB_PORT}`,
});
