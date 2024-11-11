## [1.51.3](https://github.com/metabase/metabase/compare/embedding-sdk-1.51.2...embedding-sdk-1.51.3) (2024-11-06)


### Bug Fixes

* **sdk:** ability to save questions in interactive question ([#48866](https://github.com/metabase/metabase/issues/48866)) ([#49134](https://github.com/metabase/metabase/issues/49134)) ([4721f20](https://github.com/metabase/metabase/commit/4721f204b3656b1ebc37abfe688c879b09b197f3))
* **sdk:** Editable dashboard should not overlap content below it ([#49293](https://github.com/metabase/metabase/issues/49293)) ([#49351](https://github.com/metabase/metabase/issues/49351)) ([713b55e](https://github.com/metabase/metabase/commit/713b55ecac2d2fa2464dec88f3e23ff7fe686d1f))
* **sdk:** Improve InteractiveQuestion chart selector ([#48837](https://github.com/metabase/metabase/issues/48837)) ([#49269](https://github.com/metabase/metabase/issues/49269)) ([9f6bbc9](https://github.com/metabase/metabase/commit/9f6bbc9cb8332a3f52465237727a8b752857c12b))
* **sdk:** pin iframe-resizer version to avoid excess logs for sdk cli ([#49312](https://github.com/metabase/metabase/issues/49312)) ([#49408](https://github.com/metabase/metabase/issues/49408)) ([0e09f60](https://github.com/metabase/metabase/commit/0e09f60b816c1e07b729bb9626024bb470562adc))
* **sdk:** remove runtime error on aggregated question drill ([#49064](https://github.com/metabase/metabase/issues/49064)) ([#49104](https://github.com/metabase/metabase/issues/49104)) ([c98118b](https://github.com/metabase/metabase/commit/c98118b996a1c1dfbfba5d3b03a96ce57d4fc039))
* **sdk:** static question should cancel requests on component unmount ([#48808](https://github.com/metabase/metabase/issues/48808)) ([#49138](https://github.com/metabase/metabase/issues/49138)) ([b7651d7](https://github.com/metabase/metabase/commit/b7651d7e5dcae7887fbde1b395fe48db93621862))
* **sdk:** support hiding columns in InteractiveQuestion ([#49013](https://github.com/metabase/metabase/issues/49013)) ([#49158](https://github.com/metabase/metabase/issues/49158)) ([3f4c56c](https://github.com/metabase/metabase/commit/3f4c56c68378fb35fdfa9b2e0df6ec65c9d2db9d))


### Features

* **sdk:** ability to enforce the destination collection to save to and hide the collection picker ([#49251](https://github.com/metabase/metabase/issues/49251)) ([#49479](https://github.com/metabase/metabase/issues/49479)) ([a6943f7](https://github.com/metabase/metabase/commit/a6943f7433ad1de424cc3db58233a0e06ae6df7f))
* **sdk:** Add `isOpen` prop to control CreateDashboardModal visibility ([#49452](https://github.com/metabase/metabase/issues/49452)) ([#49535](https://github.com/metabase/metabase/issues/49535)) ([de1dbd8](https://github.com/metabase/metabase/commit/de1dbd871f227382fa13a3b07199871e5c56b5bf))
* **sdk:** refactor the auth code to provide better error messages ([#49214](https://github.com/metabase/metabase/issues/49214)) ([#49579](https://github.com/metabase/metabase/issues/49579)) ([5018207](https://github.com/metabase/metabase/commit/5018207fcf61395fbf0e22c44453f0dac71706ac)), closes [#49492](https://github.com/metabase/metabase/issues/49492)



## [1.51.2](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.40...embedding-sdk-1.51.2) (2024-10-24)


### Bug Fixes

* **sdk:** Change QuestionEditor tab name to 'Editor' ([#48821](https://github.com/metabase/metabase/issues/48821)) ([#48872](https://github.com/metabase/metabase/issues/48872)) ([b469405](https://github.com/metabase/metabase/commit/b469405f212499959ed98be51e70cdab00900d9f))
* **sdk:** fix defaultProps react error ([#48764](https://github.com/metabase/metabase/issues/48764)) ([#48864](https://github.com/metabase/metabase/issues/48864)) ([4a1330a](https://github.com/metabase/metabase/commit/4a1330a112600ac052c3ef71c9d700140dae8225))
* **sdk:** hide downloads by default ([#48755](https://github.com/metabase/metabase/issues/48755)) ([#48863](https://github.com/metabase/metabase/issues/48863)) ([361bf49](https://github.com/metabase/metabase/commit/361bf49d33ebdfdb8a80b847528d6834e92c5630))


### Features

* **sdk:** `defineEmbeddingSdkConfig` to make typing easier ([#48879](https://github.com/metabase/metabase/issues/48879)) ([#48904](https://github.com/metabase/metabase/issues/48904)) ([351898c](https://github.com/metabase/metabase/commit/351898c44e110870e6d05dac525a3647ca333018))



## [0.1.40](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.39...embedding-sdk-0.1.40) (2024-10-17)


### Features

* **sdk:** Add chart viz selection for `InteractiveQuestion` ([#47744](https://github.com/metabase/metabase/issues/47744)) ([#48823](https://github.com/metabase/metabase/issues/48823)) ([821f07d](https://github.com/metabase/metabase/commit/821f07d3c354d91d2096cc3e59ec7eb2d6818066))



## [0.1.39](https://github.com/metabase/metabase/compare/embedding-sdk-1.51.0...embedding-sdk-0.1.39) (2024-10-16)


### Bug Fixes

* **sdk:** allow CLI to check React version without installing and allow continuing setup if React is missing ([#48491](https://github.com/metabase/metabase/issues/48491)) ([#48528](https://github.com/metabase/metabase/issues/48528)) ([dc8d95e](https://github.com/metabase/metabase/commit/dc8d95e8040940b0818a772a64487ad1335e6a75))
* **sdk:** Attempt to fix resize observer issues ([#48227](https://github.com/metabase/metabase/issues/48227)) ([#48561](https://github.com/metabase/metabase/issues/48561)) ([b820e86](https://github.com/metabase/metabase/commit/b820e86620ce60263c2d5da6ae7c9bc7a859d68d))



## [0.1.38](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.37...embedding-sdk-0.1.38) (2024-10-09)


### Bug Fixes

* **sdk:** allow CLI to check React version without installing and allow continuing setup if React is missing ([#48491](https://github.com/metabase/metabase/issues/48491)) ([000dfe1](https://github.com/metabase/metabase/commit/000dfe1bf44f0a0b2280633e02b242554d2b75ef))
* **sdk:** Attempt to fix resize observer issues ([#48227](https://github.com/metabase/metabase/issues/48227)) ([77cb69f](https://github.com/metabase/metabase/commit/77cb69f88e23c2cad1ff3c906b50ffaab9ff3770))
* **sdk:** update utm tags in embedding sdk cli ([#48419](https://github.com/metabase/metabase/issues/48419)) ([74be2dc](https://github.com/metabase/metabase/commit/74be2dcce507b8f1f032eb065bca93a985301138))


### Features

* **sdk:** support `locale` prop on `MetabaseProvider` ([#47569](https://github.com/metabase/metabase/issues/47569)) ([70a8ab7](https://github.com/metabase/metabase/commit/70a8ab70a8b58ac52dc89108c24f4d098a00810f))



## [0.1.37](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.36...embedding-sdk-0.1.37) (2024-10-02)


### Bug Fixes

* **sdk:** decrease specificity of css reset in embedding sdk ([#48193](https://github.com/metabase/metabase/issues/48193)) ([688b9ad](https://github.com/metabase/metabase/commit/688b9ad95da7ae9fc87d39b816d71477edc57231))
* **sdk:** fix zindex issues after switch to portals ([#48256](https://github.com/metabase/metabase/issues/48256)) ([67fc1c9](https://github.com/metabase/metabase/commit/67fc1c91b510a142f5662db9e86083f0a88ce574))
* **sdk:** modal pushing content below when opened ([#48216](https://github.com/metabase/metabase/issues/48216)) ([abe04bc](https://github.com/metabase/metabase/commit/abe04bc24ef99977014ab02ba8215a51a2b68eae))
* **sdk:** remove the unknown premium feature console warnings ([#47885](https://github.com/metabase/metabase/issues/47885)) ([381c321](https://github.com/metabase/metabase/commit/381c321ace280a9310f952eaa1f53b6992c8d638))
* **sdk:** remove ts limitation on custom fonts + some minimal e2e tests for the fonts ([#48071](https://github.com/metabase/metabase/issues/48071)) ([ed24366](https://github.com/metabase/metabase/commit/ed24366ea9855cb4e5f41eb76eef06d80e4ba21f))


### Features

* **sdk:** add visual cues in sdk around evaluation usage and feature flags ([#47821](https://github.com/metabase/metabase/issues/47821)) ([c7bd308](https://github.com/metabase/metabase/commit/c7bd308b559852552033463f12102dd32bffe2f4))
* **sdk:** Filter DataPicker models for `CreateQuestion` ([#47542](https://github.com/metabase/metabase/issues/47542)) ([d5ff47e](https://github.com/metabase/metabase/commit/d5ff47ef606fddeecc2815d40d7a45df1f771efb))



## [0.1.36](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.35...embedding-sdk-0.1.36) (2024-09-09)


### Bug Fixes

* **sdk:** Fix entity ID logic to use the correct status ([#47748](https://github.com/metabase/metabase/issues/47748)) ([fc73743](https://github.com/metabase/metabase/commit/fc7374363127669cb1b1517bc4d3a82f343fb612))
* **sdk:** remove usage of legacy query in static question ([#47727](https://github.com/metabase/metabase/issues/47727)) ([4d9b144](https://github.com/metabase/metabase/commit/4d9b144b6dd63cb82d00d17b73d480b302382cb9))


### Features

* **sdk:** add the create question component demo to the cli ([#47348](https://github.com/metabase/metabase/issues/47348)) ([4333267](https://github.com/metabase/metabase/commit/43332678243e75fce5339b607568000e29a3d115))



## [0.1.35](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.34...embedding-sdk-0.1.35) (2024-09-06)


### Bug Fixes

* **sdk:** Add `onSave` behavior to `QuestionEditor` ([#47538](https://github.com/metabase/metabase/issues/47538)) ([e998150](https://github.com/metabase/metabase/commit/e99815024bc9033ddf6170762dd390911650cc3c))
* **sdk:** Add toggle for saving questions ([#47442](https://github.com/metabase/metabase/issues/47442)) ([0711fba](https://github.com/metabase/metabase/commit/0711fba1b0d8b16b482fc1dca79b5fbfdb3aaf03))
* **sdk:** default font not working ([#47712](https://github.com/metabase/metabase/issues/47712)) ([2835164](https://github.com/metabase/metabase/commit/28351649395d8072cefbe1cc83993e7804a19183))
* **sdk:** fix typescript type references to embedding-sdk not resolving ([#47659](https://github.com/metabase/metabase/issues/47659)) ([d74fbe9](https://github.com/metabase/metabase/commit/d74fbe95ed692f36af9a59086cfae4ecb7f7fa99))
* **sdk:** Use modal instead of hacky form for saving questions ([#47448](https://github.com/metabase/metabase/issues/47448)) ([387db2a](https://github.com/metabase/metabase/commit/387db2abcd7c53dad9baf94d194f305a1e9d8640))


### Features

* **sdk:** Use stable IDs in SDK components ([#47210](https://github.com/metabase/metabase/issues/47210)) ([c2b7cc9](https://github.com/metabase/metabase/commit/c2b7cc9e807ee75d2bc94f0b5a814e01d29fd077))



## [0.1.34](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.33...embedding-sdk-0.1.34) (2024-09-02)


### Features

* **sdk:** improve license, mock server and post-install for embedding cli ([#47229](https://github.com/metabase/metabase/issues/47229)) ([d29aa55](https://github.com/metabase/metabase/commit/d29aa557eac6a9d7a72f3f8827d1a449617eb498))



## [0.1.33](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.32...embedding-sdk-0.1.33) (2024-08-30)


### Features

* **sdk:** generate sample Express.js api and user switcher components via cli ([#47060](https://github.com/metabase/metabase/issues/47060)) ([41b7f32](https://github.com/metabase/metabase/commit/41b7f329aad7eb9dac2834068d970c2c32678769))
* **sdk:** setup permissions and sandboxing for embedding cli ([#46857](https://github.com/metabase/metabase/issues/46857)) ([c574c09](https://github.com/metabase/metabase/commit/c574c09dd758cf95021e28c6d69f946a7bd85cad))



## [0.1.32](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.31...embedding-sdk-0.1.32) (2024-08-23)


### Bug Fixes

* **sdk:** apply the default viz height only in visualization view ([#47169](https://github.com/metabase/metabase/issues/47169)) ([852ddc2](https://github.com/metabase/metabase/commit/852ddc274a7cc0986580a3b14a98cbb19d5221fd))


### Features

* **sdk:** Edit Question ([#46894](https://github.com/metabase/metabase/issues/46894)) ([0a6d0a1](https://github.com/metabase/metabase/commit/0a6d0a1928722839067d0ba8ca71a966b9c3ea37))
* **sdk:** embedding cli opens the metabase store to get trial token and applies the license ([#46810](https://github.com/metabase/metabase/issues/46810)) ([4453abb](https://github.com/metabase/metabase/commit/4453abb13ad29f32876e0f19895e440bd5a72840))



## [0.1.31](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.30...embedding-sdk-0.1.31) (2024-08-16)


### Bug Fixes

* **sdk:** optimistic update query builder and update questions in notebook ([#46652](https://github.com/metabase/metabase/issues/46652)) ([3df927c](https://github.com/metabase/metabase/commit/3df927c9749167447c615379363c37e81222e86c))


### Features

* **sdk:** Add CreateDashboardModal component and hook ([#46802](https://github.com/metabase/metabase/issues/46802)) ([b9ba40d](https://github.com/metabase/metabase/commit/b9ba40d88a22ff4ce918d535b8e0804ddc15f05d))
* **sdk:** Create Question ([#46618](https://github.com/metabase/metabase/issues/46618)) ([8394213](https://github.com/metabase/metabase/commit/8394213df0e63adac9ec288a72586fc93001fd8b))



## [0.1.30](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.29...embedding-sdk-0.1.30) (2024-08-13)


### Bug Fixes

* **sdk:** Add location-specific provider for SDK ([#46681](https://github.com/metabase/metabase/issues/46681)) ([abacb88](https://github.com/metabase/metabase/commit/abacb880e68095e59e7245c2289a8a9bd4b3257d))
* **sdk:** always pull the latest image in the cli ([#46739](https://github.com/metabase/metabase/issues/46739)) ([9a33e10](https://github.com/metabase/metabase/commit/9a33e10893ead95b07ee8e6946e187ea04ce7046))
* **sdk:** fix health endpoint when polling whether metabase instance is ready ([#46730](https://github.com/metabase/metabase/issues/46730)) ([8b4f855](https://github.com/metabase/metabase/commit/8b4f8554117e615436b202bdc1dab3c086dac504))
* **sdk:** increase setup timeout to 15s to avoid 'user already created' issue on retry ([210aebe](https://github.com/metabase/metabase/commit/210aebe60bcc1fa9d914722511da2b908eacdfda))
* **sdk:** make sure generated password has at least one number, one upper case and one lower case character to avoid issues with password policies ([#46737](https://github.com/metabase/metabase/issues/46737)) ([df81b2d](https://github.com/metabase/metabase/commit/df81b2de3b6907bd312e96a75054f58304a9bab3))


### Features

* **sdk:** Add edit mode for interactive dashboard component ([#46255](https://github.com/metabase/metabase/issues/46255)) ([10e21e2](https://github.com/metabase/metabase/commit/10e21e250738804f9f8722afc9785c6748c48b39))
* **sdk:** generate sample react component with the embedding cli ([#46538](https://github.com/metabase/metabase/issues/46538)) ([4c3df61](https://github.com/metabase/metabase/commit/4c3df61d2a0161432a121cfa2fdcaa1b16e6bdc6))



## [0.1.29](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.28...embedding-sdk-0.1.29) (2024-08-09)


### Bug Fixes

* **sdk:** Fix unmapped theme colors ([#46650](https://github.com/metabase/metabase/issues/46650)) ([69e0118](https://github.com/metabase/metabase/commit/69e011853d1f514792a8bd26eb4aab5d553f6215))



## [0.1.28](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.27...embedding-sdk-0.1.28) (2024-08-08)


### Features

* **sdk:** connect databases, generate models and x-rays from the CLI ([#46502](https://github.com/metabase/metabase/issues/46502)) ([178997d](https://github.com/metabase/metabase/commit/178997d776355c265be7450c4b8a469b61ec2fca))



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
