## [0.1.27](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.26...embedding-sdk-0.1.27) (2024-08-07)


### Features

* **sdk:** Add storybook docs for embedding SDK e2e tests debug ([#46496](https://github.com/metabase/metabase/issues/46496)) ([22944e1](https://github.com/metabase/metabase/commit/22944e115fef87fb8a3e3b3cf7b0db690d900b88))
* **sdk:** CLI to bootstrap an embedding-ready Metabase instance ([#46080](https://github.com/metabase/metabase/issues/46080)) ([4ce37a2](https://github.com/metabase/metabase/commit/4ce37a25167f93e8d0399745cfb931891ce6a606))



## [0.1.26](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.25...embedding-sdk-0.1.26) (2024-08-02)


### Features

* **sdk:** Add Embedding SDK analytics context for API requests ([#45059](https://github.com/metabase/metabase/issues/45059)) ([fc5115d](https://github.com/metabase/metabase/commit/fc5115d6222e37dce527a964d6413bc1c5f0caa2))



## [0.1.25](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.24...embedding-sdk-0.1.25) (2024-07-29)


### Features

* **sdk:** Add API keys for development mode ([#46067](https://github.com/metabase/metabase/issues/46067)) ([337bf68](https://github.com/metabase/metabase/commit/337bf6883b0b2a06398aacfccfb4140b10dc92fb))
* **sdk:** add CLI to download and start Metabase locally for better onboarding experience ([#45784](https://github.com/metabase/metabase/issues/45784)) ([3fe3739](https://github.com/metabase/metabase/commit/3fe3739194c966eacb68a0899f2e5760310f219f))
* **sdk:** Add SDK storybook and e2e tests tooling ([#45512](https://github.com/metabase/metabase/issues/45512)) ([871955e](https://github.com/metabase/metabase/commit/871955e8ebc8a36eb245a8f3e030dd1a942c94bc))



## [0.1.24](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.23...embedding-sdk-0.1.24) (2024-07-24)


### Bug Fixes

* **sdk:** support React 17 backwards compatibility ([#46012](https://github.com/metabase/metabase/issues/46012)) ([3ceac07](https://github.com/metabase/metabase/commit/3ceac07d4ddd9f89fa33d50f5a73a394165c2b5e))
* **sdk:** throw errors when sdk hooks are used outside of redux context ([#45999](https://github.com/metabase/metabase/issues/45999)) ([bfdcf0c](https://github.com/metabase/metabase/commit/bfdcf0cb73ac4b58a1b1efd46b0239df791fe2a2))



## [0.1.23](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.22...embedding-sdk-0.1.23) (2024-07-23)


### Bug Fixes

* **sdk:** missing semantic text colors mapping ([#45859](https://github.com/metabase/metabase/issues/45859)) ([b69d4d5](https://github.com/metabase/metabase/commit/b69d4d5ecd993e75c0e1c56b99406106d0167a14))



## [0.1.22](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.21...embedding-sdk-0.1.22) (2024-07-19)


### Bug Fixes

* **sdk:** make png/pdf export work in the sdk ([#45751](https://github.com/metabase/metabase/issues/45751)) ([a09d136](https://github.com/metabase/metabase/commit/a09d136ede1a02fb23c1525f123d701baad32a1d))



## [0.1.21](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.20...embedding-sdk-0.1.21) (2024-07-18)


### Bug Fixes

* **sdk:** fix downloads not working on sdk ([#45657](https://github.com/metabase/metabase/issues/45657)) ([489a0ac](https://github.com/metabase/metabase/commit/489a0ac8da13e586b1a9b1bf8fe1ddac341dce48))


### Features

* **sdk:** theme option to customize popover's z-index ([#45613](https://github.com/metabase/metabase/issues/45613)) ([1e48f96](https://github.com/metabase/metabase/commit/1e48f9629a9d025f3c6d28666a7336ac5501fd92))



## [0.1.20](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.19...embedding-sdk-0.1.20) (2024-07-16)


### Bug Fixes

* **sdk:** Allow mapping dashboard buttons for future customization ([#45356](https://github.com/metabase/metabase/issues/45356)) ([51c1d83](https://github.com/metabase/metabase/commit/51c1d83ea6cb387b81580bf63cd76c8d021d1331))
* **sdk:** Remove default Count aggregation without triggering a query update ([#45398](https://github.com/metabase/metabase/issues/45398)) ([2895cc3](https://github.com/metabase/metabase/commit/2895cc3a2b76069504853236a8b0facda7be9bba))
* **sdk:** rename scalar theme option to number ([#45610](https://github.com/metabase/metabase/issues/45610)) ([dfab267](https://github.com/metabase/metabase/commit/dfab26710da2b14bf1a1b43c4e941f396d3f9ec6))
* **sdk:** sync fetch request token function with store ([#45596](https://github.com/metabase/metabase/issues/45596)) ([b5fa28e](https://github.com/metabase/metabase/commit/b5fa28e210c0a585528f9a98ce541658ece23803))


### Features

* **sdk:** add useMetabaseAuthStatus hook to get current authentication status ([#45606](https://github.com/metabase/metabase/issues/45606)) ([97cfe29](https://github.com/metabase/metabase/commit/97cfe29e894d63733ce29e391d5ff8d5e98fe4d2))



## [0.1.19](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.18...embedding-sdk-0.1.19) (2024-07-15)


### Features

* **sdk:** ability to pass parameters to static questions ([#45498](https://github.com/metabase/metabase/issues/45498)) ([fa33531](https://github.com/metabase/metabase/commit/fa335318ae622f69c347166705a7542e4b5c48d8))



## [0.1.18](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.17...embedding-sdk-0.1.18) (2024-07-12)


### Bug Fixes

* **sdk:** Add README for dashcard menu modifications ([#45417](https://github.com/metabase/metabase/issues/45417)) ([f3b6e9b](https://github.com/metabase/metabase/commit/f3b6e9bcee5d698f0cb64a648ef9f236dd00a2b5))


### Features

* **sdk:** Add event handlers docs, refactor handlers naming ([#45374](https://github.com/metabase/metabase/issues/45374)) ([7e6adfa](https://github.com/metabase/metabase/commit/7e6adfaa3f3290601162135f546cdcaa3c120a85))
* **sdk:** support multiple interactive questions by decoupling from query builder reducer ([#45133](https://github.com/metabase/metabase/issues/45133)) ([49926e6](https://github.com/metabase/metabase/commit/49926e687366b0c67eb6748b4b154a32933167bf))



## [0.1.17](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.16...embedding-sdk-0.1.17) (2024-07-10)


### Features

* **sdk:** ability to specify a function to fetch the refresh token ([#45313](https://github.com/metabase/metabase/issues/45313)) ([7af7213](https://github.com/metabase/metabase/commit/7af7213e6410c426fd7f7461b3f79de66f8ab8e6))
* **sdk:** Add Dashboard loading event handlers ([#45153](https://github.com/metabase/metabase/issues/45153)) ([5133081](https://github.com/metabase/metabase/commit/51330810cb4a780d11e2f845f7211045609ec058))
* **sdk:** Add overflow menu options to Interactive Dashboard cards ([#45138](https://github.com/metabase/metabase/issues/45138)) ([57ce93a](https://github.com/metabase/metabase/commit/57ce93aaecd270d474f077086dee92b6f2e3c88a))



## [0.1.16](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.15...embedding-sdk-0.1.16) (2024-07-03)


### Bug Fixes

* **sdk:** Improve filter/summarize/notebook layouts ([#45039](https://github.com/metabase/metabase/issues/45039)) ([63167c7](https://github.com/metabase/metabase/commit/63167c74088876f8eb77353656f8a406fff32ba9))
* **sdk:** modify `Custom column` widget in notebook to conform to some styles ([#45044](https://github.com/metabase/metabase/issues/45044)) ([1175caf](https://github.com/metabase/metabase/commit/1175cafb631faafd8800a60058af40305eb2adac))
* **sdk:** runtime error when font family is not provided ([#44989](https://github.com/metabase/metabase/issues/44989)) ([213b6d2](https://github.com/metabase/metabase/commit/213b6d2c81fbcb4805fa2ac071de1c5e8ea431a1))


### Features

* **sdk:** Add customizable layout to interactive question ([#44775](https://github.com/metabase/metabase/issues/44775)) ([7fafc1a](https://github.com/metabase/metabase/commit/7fafc1aa7b60fbd97d41b9d1f847e943afb242b1))
* **sdk:** Improve dashboard and question loaders to show in the middle ([#44710](https://github.com/metabase/metabase/issues/44710)) ([8786c23](https://github.com/metabase/metabase/commit/8786c23a50b07872a038d3e46188b130f0edd1ee))



## [0.1.15](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.14...embedding-sdk-0.1.15) (2024-06-28)


### Bug Fixes

* **sdk:** Convert components in `InteractiveQuestion` to context-aware components ([#44738](https://github.com/metabase/metabase/issues/44738)) ([11cf86e](https://github.com/metabase/metabase/commit/11cf86e63c9288b585c9c0d786913a691564f977))
* **sdk:** Fix SDK types, split files, and improve navigation within SDK `InteractiveQuestion` ([#44898](https://github.com/metabase/metabase/issues/44898)) ([92c1961](https://github.com/metabase/metabase/commit/92c19615441f39669266861b886ca29acf91f069))
* **sdk:** Move InteractiveQuestionResult variables into provider ([#44730](https://github.com/metabase/metabase/issues/44730)) ([6e7e51f](https://github.com/metabase/metabase/commit/6e7e51f581847f8639dd854733e2d50e66f8c729))
* **sdk:** Upgrade outdated dependencies to remove installation warnings ([#44774](https://github.com/metabase/metabase/issues/44774)) ([d480a4d](https://github.com/metabase/metabase/commit/d480a4d3028a46732657d0c59d444b7a0d8daccb))


### Features

* **sdk:** Add filter, summarize, and notebook functionality to `InteractiveQuestion` ([#44494](https://github.com/metabase/metabase/issues/44494)) ([d0274f7](https://github.com/metabase/metabase/commit/d0274f7ba94901f5cc84b3db8d98278c443b8c22))
* **sdk:** Improve dashboard to question navigation ([#44648](https://github.com/metabase/metabase/issues/44648)) ([7091c9e](https://github.com/metabase/metabase/commit/7091c9eb4771de4ae617df9623cb0cba0b8632cb))



## [0.1.14](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.13...embedding-sdk-0.1.14) (2024-06-26)


### Bug Fixes

* **sdk:** missing css variables when rendering under a portal ([#44473](https://github.com/metabase/metabase/issues/44473)) ([70eea11](https://github.com/metabase/metabase/commit/70eea1167b7c5209f0813f82bc99cdacd553c210))
* **sdk:** upgrade D3.js to the latest version for Vite compatibility ([#44562](https://github.com/metabase/metabase/issues/44562)) ([87914fd](https://github.com/metabase/metabase/commit/87914fd870f8e054aa1905a9c87a7142b2c667dc))



## [0.1.13](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.12...embedding-sdk-0.1.13) (2024-06-21)


### Bug Fixes

* **sdk:** font size, color and padding in viz ([#44283](https://github.com/metabase/metabase/issues/44283)) ([dab2d85](https://github.com/metabase/metabase/commit/dab2d8527770510218d5df3467c04592b1f6ec85))
* **sdk:** load custom font files when font is set to custom ([#44432](https://github.com/metabase/metabase/issues/44432)) ([992b2e8](https://github.com/metabase/metabase/commit/992b2e899f50d7b6210da6f3925938cc3ca1f83c))



## [0.1.12](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.11...embedding-sdk-0.1.12) (2024-06-20)


### Features

* **sdk:** Add interactive dashboards to embedding SDK ([#44161](https://github.com/metabase/metabase/issues/44161)) ([fa32093](https://github.com/metabase/metabase/commit/fa3209327127c88ef930273c873fe0397a782ce4))



## [0.1.11](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.10...embedding-sdk-0.1.11) (2024-06-19)



## [0.1.10](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.9...embedding-sdk-0.1.10) (2024-06-19)


### Bug Fixes

* **sdk:** Add theming options for Collection Browser's empty content message ([#44281](https://github.com/metabase/metabase/issues/44281)) ([f57be77](https://github.com/metabase/metabase/commit/f57be777d48b50fcb22a4fd0934a4f8c48d6a162))
* **sdk:** Fix spacing between collection browser and breadcrumbs ([#44342](https://github.com/metabase/metabase/issues/44342)) ([cc17b9e](https://github.com/metabase/metabase/commit/cc17b9e88edeadfafad547e3815a18948253d1f2))
* **sdk:** Remove night mode toggle from SDK static dashboards ([#44284](https://github.com/metabase/metabase/issues/44284)) ([8cb98be](https://github.com/metabase/metabase/commit/8cb98be8af162e4dab09aad85c88cd129f191d65))



## [0.1.9](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.8...embedding-sdk-0.1.9) (2024-06-14)


### Bug Fixes

* **sdk:** Add theming to collection browser breadcrumbs ([#44066](https://github.com/metabase/metabase/issues/44066)) ([81a586d](https://github.com/metabase/metabase/commit/81a586df95cf13252ec1ffec79f3a8613c7adbf4))
* **sdk:** Update README to move `Embedding the collection browser` to `Features currently supposed` ([#44208](https://github.com/metabase/metabase/issues/44208)) ([d7a1e86](https://github.com/metabase/metabase/commit/d7a1e86798ba01c8c013d1f5cd855f7c4f1b1870))


### Features

* **sdk:** Add collection browser ([#43606](https://github.com/metabase/metabase/issues/43606)) ([14db7ae](https://github.com/metabase/metabase/commit/14db7aeeacbf7ce88f3fb921a79f7715d70ea56c))
* **sdk:** apply theme options to tables in static dashboard ([#44007](https://github.com/metabase/metabase/issues/44007)) ([ee38f0e](https://github.com/metabase/metabase/commit/ee38f0e4498c8478595837673d2ae30f3a4c79c4))
* **sdk:** option to hide dashboard card title ([#43859](https://github.com/metabase/metabase/issues/43859)) ([d843973](https://github.com/metabase/metabase/commit/d843973a8ea4cf74d25fa84cf307de3d29a1c124))
* **sdk:** SDK theming part 5 - success, summarize, warning, white, text-white, bg-white ([#43676](https://github.com/metabase/metabase/issues/43676)) ([7046fef](https://github.com/metabase/metabase/commit/7046fef3c4d71d8e17f090b6f0af4a40eb5f6190))
* **sdk:** SDK theming part 6 - text-brand, text-dark, text-light, text-medium, admin-navbar, `accentX` ([#43687](https://github.com/metabase/metabase/issues/43687)) ([e8fedf0](https://github.com/metabase/metabase/commit/e8fedf0164cb1d885d3090f0c09b80cc557425ed)), closes [#43472](https://github.com/metabase/metabase/issues/43472) [#43286](https://github.com/metabase/metabase/issues/43286) [#43736](https://github.com/metabase/metabase/issues/43736) [#43750](https://github.com/metabase/metabase/issues/43750) [#43754](https://github.com/metabase/metabase/issues/43754) [#43428](https://github.com/metabase/metabase/issues/43428) [#39083](https://github.com/metabase/metabase/issues/39083)
* **sdk:** theme option to customize the dashboard card border ([#43963](https://github.com/metabase/metabase/issues/43963)) ([a742b34](https://github.com/metabase/metabase/commit/a742b3408bc7a3325e2975e2d0a48ed89f6c4a47))



## [0.1.7](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.6...embedding-sdk-0.1.7) (2024-06-06)


### Bug Fixes

* **sdk:** Fix map visualizations breaking ([#43491](https://github.com/metabase/metabase/issues/43491)) ([ecad0c9](https://github.com/metabase/metabase/commit/ecad0c94b5467227728c910a4a4c9f88122a1125))
* **sdk:** Fix static dashboard API ([#43581](https://github.com/metabase/metabase/issues/43581)) ([5c5f6c3](https://github.com/metabase/metabase/commit/5c5f6c39a134b14de85488e66ad3aca18c42e351))


### Features

* **sdk:** font size scaling and adjustment for visualizations ([#43264](https://github.com/metabase/metabase/issues/43264)) ([9d61985](https://github.com/metabase/metabase/commit/9d61985fcc4139db4bb13598bdb66c9ba8b47fa4))
* **sdk:** SDK theming part 1 - black, bg-light, bg-dark, bg-black ([#43413](https://github.com/metabase/metabase/issues/43413)) ([d228123](https://github.com/metabase/metabase/commit/d228123152ba9b2a9c8ee89f32fe4209e592648a))
* **sdk:** SDK theming part 2 - bg-error, bg-medium, bg-night, bg-white, border ([#43512](https://github.com/metabase/metabase/issues/43512)) ([8659846](https://github.com/metabase/metabase/commit/8659846f0b011af29f92719ac9273c63df76e0d3))
* **sdk:** SDK theming part 3 - brand, brand-light, brand-lighter ([#43598](https://github.com/metabase/metabase/issues/43598)) ([6fcbf23](https://github.com/metabase/metabase/commit/6fcbf23e5430a050865b597c651d97eda6bdf74f))
* **sdk:** SDK theming part 4 - danger, dark, error, filter, focus, saturated, shadow ([#43608](https://github.com/metabase/metabase/issues/43608)) ([e430b77](https://github.com/metabase/metabase/commit/e430b776e3c36b209e162c9db285971a812de20a))



## [0.1.6](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.5...embedding-sdk-0.1.6) (2024-05-31)


### Features

* **sdk:** Add static dashboards to embedding SDK ([#41973](https://github.com/metabase/metabase/issues/41973)) ([d0314b2](https://github.com/metabase/metabase/commit/d0314b2e9c4d6df53f6134855889c800d605b5e9))
* **sdk:** expose color and typography options for smart scalar in embedding SDK ([#42915](https://github.com/metabase/metabase/issues/42915)) ([8fc52d2](https://github.com/metabase/metabase/commit/8fc52d228b32a7fe73f7419d0db33d71445e2c94))
* **sdk:** override chart colors ([#42960](https://github.com/metabase/metabase/issues/42960)) ([8cbacf7](https://github.com/metabase/metabase/commit/8cbacf7511a384a3f6ec5a1deacfe6613363ba76))
* **sdk:** pivot table color customizations ([#43201](https://github.com/metabase/metabase/issues/43201)) ([b55e141](https://github.com/metabase/metabase/commit/b55e141fe8bfba09b2325b585499ad336409afc7))



## [0.1.5](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.0...embedding-sdk-0.1.5) (2024-05-30)


### Bug Fixes

* **sdk:** Use theme font in charts and tooltips ([#42855](https://github.com/metabase/metabase/issues/42855)) ([0278b8d](https://github.com/metabase/metabase/commit/0278b8d22174a3555b212df73967a8582e8f3e88))
* **sdk:** Various fixes for InteractiveQuestion theming ([#42932](https://github.com/metabase/metabase/issues/42932)) ([a3c3193](https://github.com/metabase/metabase/commit/a3c3193474d50c2a4726118cf844d8ed3bb8e974))


### Features

* **sdk:** apply user interface color overrides to the sdk ([#42834](https://github.com/metabase/metabase/issues/42834)) ([2e9a53a](https://github.com/metabase/metabase/commit/2e9a53a778cfc80b9e414efdcfad730d803a2849))
* **sdk:** document theming options in readme ([#42784](https://github.com/metabase/metabase/issues/42784)) ([74ec3ee](https://github.com/metabase/metabase/commit/74ec3eeec76a6d99984f01f780ad3e816e0e9733))
