## [0.55.1-nightly](https://github.com/metabase/metabase/compare/embedding-sdk-0.54.3-nightly...embedding-sdk-0.55.1-nightly) (2025-04-04)


### Bug Fixes

* **sdk:**  wrong icon on visualization selector ([#54724](https://github.com/metabase/metabase/issues/54724)) ([cbf51e6](https://github.com/metabase/metabase/commit/cbf51e6dc33ad7b0749a8bfcf8c18f746bd34138))
* **sdk:** Add `questionProps` to dashboard components ([#55993](https://github.com/metabase/metabase/issues/55993)) ([6d7ae96](https://github.com/metabase/metabase/commit/6d7ae9677984e193fe364e5011564af4748d99d2))
* **sdk:** don't set the color scheme on the host app ([#54918](https://github.com/metabase/metabase/issues/54918)) ([77e231d](https://github.com/metabase/metabase/commit/77e231de6c39c8616792d46dfbbdb5691c7a96d2))
* **sdk:** Entity ID support for CreateDashboardModal ([#55358](https://github.com/metabase/metabase/issues/55358)) ([2d4a7d0](https://github.com/metabase/metabase/commit/2d4a7d05df276bc14c9fcb4c6d8ee71e9525471a))
* **sdk:** expose the correct type for saveToCollection ([#54428](https://github.com/metabase/metabase/issues/54428)) ([54a7b1c](https://github.com/metabase/metabase/commit/54a7b1c707e814c735d19e36d914529791cf5b7c))
* **sdk:** Fix ad-hoc question view when clicking into SDK dashboard ([#55254](https://github.com/metabase/metabase/issues/55254)) ([928683d](https://github.com/metabase/metabase/commit/928683dc7145d477a99d91efe086d3a409fa913b))
* **sdk:** Fix ColorRangeSelector in Conditional Formatting ([#54450](https://github.com/metabase/metabase/issues/54450)) ([752e924](https://github.com/metabase/metabase/commit/752e9246e59541a3e70968959bfd1e1b9592c4e1))
* **sdk:** Fix ColorSelector in Conditional Formatting ([#54402](https://github.com/metabase/metabase/issues/54402)) ([cd06480](https://github.com/metabase/metabase/commit/cd06480c6b7d404d8f93ad514ed06158776285eb))
* **sdk:** fix dataset endpoint being called on every re-render ([#56100](https://github.com/metabase/metabase/issues/56100)) ([c5d31e8](https://github.com/metabase/metabase/commit/c5d31e8ba26308135bb76e80a84af1797067e501))
* **sdk:** Improve _.compose type + fix SDK type ([#54850](https://github.com/metabase/metabase/issues/54850)) ([59d5f32](https://github.com/metabase/metabase/commit/59d5f32f10224be9c4bbd285ef052cf1200fa9a3))
* **sdk:** mark all react-dom dependency requests as external for React 19 compatibility ([#55071](https://github.com/metabase/metabase/issues/55071)) ([87354c1](https://github.com/metabase/metabase/commit/87354c136f93ef334a1b53635666c8a032f02751))
* **sdk:** mark react-dom/client as external to fix warnings in React 19 ([#54919](https://github.com/metabase/metabase/issues/54919)) ([b178fee](https://github.com/metabase/metabase/commit/b178fee0c4bf1e32d265d71a89980cbeca00b2fb))
* **sdk:** move import of mantine css to index file of sdk ([#54602](https://github.com/metabase/metabase/issues/54602)) ([b427265](https://github.com/metabase/metabase/commit/b427265c7da86f4c6a96f927f419cb6e47d3e2de))
* **sdk:** Popovers not working on Safari ([#55012](https://github.com/metabase/metabase/issues/55012)) ([6586b58](https://github.com/metabase/metabase/commit/6586b589c8b65196a19fca374b7e64ae1cd8ed98))
* **sdk:** remove react-router console error in LegendLabel when in React 19 ([#54926](https://github.com/metabase/metabase/issues/54926)) ([576567b](https://github.com/metabase/metabase/commit/576567b379ddb64f95ab22cfc3fb02ab348c13f2))


### Features

* **sdk:** Add DownloadWidget and DownloadWidgetDropdown ([#54546](https://github.com/metabase/metabase/issues/54546)) ([129cd93](https://github.com/metabase/metabase/commit/129cd93aa62c29b5dedfc3c728e58d82b5804b36))
* **sdk:** Add entity IDs to CollectionBrowser ([#54985](https://github.com/metabase/metabase/issues/54985)) ([65cd90a](https://github.com/metabase/metabase/commit/65cd90a5b640d0ea5d15e244170b7c4e9a708e93))
* **sdk:** Add stable ID support where missing ([#54975](https://github.com/metabase/metabase/issues/54975)) ([fa41120](https://github.com/metabase/metabase/commit/fa4112062973a1aedfb1d7f9d649a28f3a1d38c2))
* **sdk:** do not setup sandboxing and show user switcher if using a sample database ([#55105](https://github.com/metabase/metabase/issues/55105)) ([588abf1](https://github.com/metabase/metabase/commit/588abf10ed983291a17e1ad2934aff90bf41b270))
* **sdk:** Ensure that all dashboards use entity ID the same way ([#55010](https://github.com/metabase/metabase/issues/55010)) ([1f76048](https://github.com/metabase/metabase/commit/1f760489a4054ac930f94c7c3f90a7a97acc3c2e))
* **sdk:** experimental react 19 version range support ([#54904](https://github.com/metabase/metabase/issues/54904)) ([1e59047](https://github.com/metabase/metabase/commit/1e590475c90279ee605ae06c039936bc89b1a512))
* **sdk:** Revamp TableInteractive visualization component: update header styles, add text wrapping, and row indices ([#54399](https://github.com/metabase/metabase/issues/54399)) ([e4a6d8a](https://github.com/metabase/metabase/commit/e4a6d8a81e58cf2a8d7aad683d3127b015e2a803))
* **sdk:** Simple data picker ([#54489](https://github.com/metabase/metabase/issues/54489)) ([f417142](https://github.com/metabase/metabase/commit/f4171427b21b8c21407274e0f606ffaeb3692986)), closes [#52964](https://github.com/metabase/metabase/issues/52964)
* **sdk:** Use dts rollup to generate a single .d.ts file with types ([#56205](https://github.com/metabase/metabase/issues/56205)) ([1bb7881](https://github.com/metabase/metabase/commit/1bb78814cfa70e5432a3e8f754fcc360c86d51fe))
* **sdk:** use questionId={new} for creating new questions ([#54323](https://github.com/metabase/metabase/issues/54323)) ([fb25682](https://github.com/metabase/metabase/commit/fb25682fe8dbafe2062e37bce832f62440872ab7))



## [0.54.3-nightly](https://github.com/metabase/metabase/compare/embedding-sdk-0.54.2-nightly...embedding-sdk-0.54.3-nightly) (2025-02-26)


### Bug Fixes

* **sdk:** [EMB-154] Pivot table visualization settings tabs caused jarring width change ([#54023](https://github.com/metabase/metabase/issues/54023)) ([17578a7](https://github.com/metabase/metabase/commit/17578a74c3c2531942806370e78fe20ea94d506f))
* **sdk:** add forwardRef to remove 'Function components cannot be given ([#54280](https://github.com/metabase/metabase/issues/54280)) ([af88536](https://github.com/metabase/metabase/commit/af88536cefc8482f6866412aad1127716caed2d0))
* **sdk:** Add missing support of mapQuestionClickActions plugin for InteractiveDashboard ([#54240](https://github.com/metabase/metabase/issues/54240)) ([01bad49](https://github.com/metabase/metabase/commit/01bad49f5b5536354ad98f05d8bb8864a7f38d2d))
* **sdk:** deprecate the CreateQuestion component ([#54212](https://github.com/metabase/metabase/issues/54212)) ([837df59](https://github.com/metabase/metabase/commit/837df592232ccd2b3c82bc1c1bbd1862cb606863))
* **sdk:** move some emotion to css, scope it to .mb-wrapper and use it in the sdk ([#54202](https://github.com/metabase/metabase/issues/54202)) ([789f1d5](https://github.com/metabase/metabase/commit/789f1d5002bcc4b7aac05ff492a741cfabb7e02c))
* **sdk:** Rename saveToCollectionId to saveToCollection ([#54225](https://github.com/metabase/metabase/issues/54225)) ([f77ff5e](https://github.com/metabase/metabase/commit/f77ff5e4922647991cfde71b024960e48a785014))


### Features

* **sdk:** cli should ask to remove the instance early if one exists ([#53545](https://github.com/metabase/metabase/issues/53545)) ([250b47b](https://github.com/metabase/metabase/commit/250b47b0d82396ae0a33a156baaf34e3635854b5))



## [0.54.2-nightly](https://github.com/metabase/metabase/compare/embedding-sdk-0.54.1-nightly...embedding-sdk-0.54.2-nightly) (2025-02-25)


### Bug Fixes

* **sdk:** Add dir attribute for PublicComponentStylesWrapper ([#54082](https://github.com/metabase/metabase/issues/54082)) ([c4e499c](https://github.com/metabase/metabase/commit/c4e499cd2a1b9a5739dda0cbd8a6be78ad03c160))
* **sdk:** auto-select sample database tables in cli ([#53654](https://github.com/metabase/metabase/issues/53654)) ([8af4499](https://github.com/metabase/metabase/commit/8af4499d470a0f2641539687020f3252f2b6b6d5))
* **sdk:** fix visual artifacts in binning options ([#53961](https://github.com/metabase/metabase/issues/53961)) ([7ad55f5](https://github.com/metabase/metabase/commit/7ad55f50997f09640884e5475ecc9c0d217ec034))
* **sdk:** hide "New Question" in EditableDashboard sidebar ([#53908](https://github.com/metabase/metabase/issues/53908)) ([8423d63](https://github.com/metabase/metabase/commit/8423d6382a9635026918277203ee14ebb09ff942))
* **sdk:** improve example component import paths in cli ([#53473](https://github.com/metabase/metabase/issues/53473)) ([33a64e9](https://github.com/metabase/metabase/commit/33a64e993f5dfa6046d1d72760fff84edd6717dc))


### Features

* **sdk:** asks whether to add a db right before adding db connection in the cli ([#53680](https://github.com/metabase/metabase/issues/53680)) ([f957817](https://github.com/metabase/metabase/commit/f957817f705c76ac3e675fa802751aab2c0c1526))
* **sdk:** use new querying layout for create question flow ([#53976](https://github.com/metabase/metabase/issues/53976)) ([65b050e](https://github.com/metabase/metabase/commit/65b050eb7d701a871668ba442476482da7b48a57))



## [0.54.1-nightly](https://github.com/metabase/metabase/compare/embedding-sdk-0.53.1-nightly...embedding-sdk-0.54.1-nightly) (2025-02-17)


### Bug Fixes

* **sdk:**  handle 'personal' for collectionId when creating dashboards and in the collection browser ([#53553](https://github.com/metabase/metabase/issues/53553)) ([d3f0a4b](https://github.com/metabase/metabase/commit/d3f0a4b1b2b27eff39381f9d26247d5278a912ac))
* **sdk:** Add segmented button for chart settings ([#52076](https://github.com/metabase/metabase/issues/52076)) ([f18e43a](https://github.com/metabase/metabase/commit/f18e43a0f02e953cc7c7ffebcddd912c281f4cad))
* **sdk:** add theme change transition to the root element ([#52427](https://github.com/metabase/metabase/issues/52427)) ([af09494](https://github.com/metabase/metabase/commit/af094941c884db522f46d6f2007b2e1014f2219f))
* **sdk:** better scope for SCOPED_CSS_RESET to fix transparent ([#53443](https://github.com/metabase/metabase/issues/53443)) ([c03a49a](https://github.com/metabase/metabase/commit/c03a49a87c5cccaed51b2f7f84c9734dab75e2d9))
* **sdk:** Clean up and enhance `InteractiveQuestion` docs ([#53283](https://github.com/metabase/metabase/issues/53283)) ([9a55442](https://github.com/metabase/metabase/commit/9a554425e202f32996270871a5adc70a96011fc4))
* **sdk:** dashboard not found when switching dashboards in cli ([#53452](https://github.com/metabase/metabase/issues/53452)) ([9d12421](https://github.com/metabase/metabase/commit/9d12421e41e911d35fc20fd43980a1a1e7754c38))
* **sdk:** disable dashboard card click behavior and prevent url formatting ([#51290](https://github.com/metabase/metabase/issues/51290)) ([ea4ee80](https://github.com/metabase/metabase/commit/ea4ee806aa4a9f488de4361008e7f2206e50340f))
* **sdk:** echarts tooltip is cut off below the viewport height ([#52310](https://github.com/metabase/metabase/issues/52310)) ([88141a8](https://github.com/metabase/metabase/commit/88141a8fca9009506c98658b39f8d537f8f31b9d))
* **sdk:** echarts tooltip is cut off below the viewport height ([#52822](https://github.com/metabase/metabase/issues/52822)) ([faa7c73](https://github.com/metabase/metabase/commit/faa7c736d060c3f167b6f2e73638b00d4742ca0c))
* **sdk:** filterout @types/react from the generated package.json ([#53747](https://github.com/metabase/metabase/issues/53747)) ([1e1a8ff](https://github.com/metabase/metabase/commit/1e1a8ffa0e24bbff3e990d1465bb97ca4e1ceb71))
* **sdk:** fix data picker crash by using mantine popover ([#52096](https://github.com/metabase/metabase/issues/52096)) ([6ef8258](https://github.com/metabase/metabase/commit/6ef825835aa194547b606aa3c149fdda0d9418c9))
* **sdk:** fix minWidth console error in dashboard grid ([#52880](https://github.com/metabase/metabase/issues/52880)) ([f442920](https://github.com/metabase/metabase/commit/f442920bb872b35bd6d922e1f28416e4e332b8e5))
* **sdk:** Fix nextJS compatibility layer missing components ([#52672](https://github.com/metabase/metabase/issues/52672)) ([a904c1e](https://github.com/metabase/metabase/commit/a904c1e5be990708ee9ce2e95679bd75b46c0ef1))
* **sdk:** Fix question not found error showing briefly after navigating from dashboards ([#53284](https://github.com/metabase/metabase/issues/53284)) ([924e2ec](https://github.com/metabase/metabase/commit/924e2ecd3d6fee73082d245c2f356457c3f672cb))
* **sdk:** fix save question form's cancel button height ([#52504](https://github.com/metabase/metabase/issues/52504)) ([e3cdbbf](https://github.com/metabase/metabase/commit/e3cdbbf7a8ac5f18a016e16781784ad7d25899eb))
* **sdk:** make headers in generated cli components responsive ([#53455](https://github.com/metabase/metabase/issues/53455)) ([cf4f46e](https://github.com/metabase/metabase/commit/cf4f46e5c65b5492b06d2f0960fa1b40f4bf3f7b))
* **sdk:** remove error about stageIndex prop being passed to dom element ([#53165](https://github.com/metabase/metabase/issues/53165)) ([61a58ed](https://github.com/metabase/metabase/commit/61a58edaf9442a634fb2b210de4eb7e9969fb83e))
* **sdk:** Remove ExplicitSize findDOMNode console errors ([#52253](https://github.com/metabase/metabase/issues/52253)) ([70d4582](https://github.com/metabase/metabase/commit/70d4582f677a1d129e1c9bf0073a46a79e0d9f08))
* **sdk:** remove unsafe lifecycle errors from DashboardGrid ([#53213](https://github.com/metabase/metabase/issues/53213)) ([29bcb43](https://github.com/metabase/metabase/commit/29bcb43082eb7b997638a613de18404112483ea5))
* **sdk:** remove unsafe lifecycle errors from Visualization ([#52885](https://github.com/metabase/metabase/issues/52885)) ([cb82663](https://github.com/metabase/metabase/commit/cb8266362c921c8e05145eba8f52791a615d6522))
* **sdk:** Standardize SDK components errors with different ID formats ([#49714](https://github.com/metabase/metabase/issues/49714)) ([3527c91](https://github.com/metabase/metabase/commit/3527c911d7556a068581c5240f2d6f6f2c338bb5)), closes [metabase#51969](https://github.com/metabase/issues/51969)


### Features

* **sdk:** abort cli with message when react version is unsupported ([#53656](https://github.com/metabase/metabase/issues/53656)) ([8a651a2](https://github.com/metabase/metabase/commit/8a651a248b3c72063a453686421e55bf6f859826))
* **sdk:** add Next.js compatibility to embedding cli ([#50281](https://github.com/metabase/metabase/issues/50281)) ([b0900d8](https://github.com/metabase/metabase/commit/b0900d88f0fb62900749113591902d1437198cf9))
* **sdk:** Add option to remove dashboard footer ([#52555](https://github.com/metabase/metabase/issues/52555)) ([cd20934](https://github.com/metabase/metabase/commit/cd209344c6175fbd8bb9b4b5a9ac5565d96f420e))
* **sdk:** add the instance url to the cli's login json file ([#53469](https://github.com/metabase/metabase/issues/53469)) ([8aa6ee0](https://github.com/metabase/metabase/commit/8aa6ee0ed71a055453fc7eee455979c80fa4f810))
* **sdk:** apply theming to interactive question modules ([#52513](https://github.com/metabase/metabase/issues/52513)) ([a2794d6](https://github.com/metabase/metabase/commit/a2794d6ae23755cc72dec4fb4ba943b5556fa5f5))
* **sdk:** granular documentation links in usage problem banner ([#52257](https://github.com/metabase/metabase/issues/52257)) ([3bcf2d5](https://github.com/metabase/metabase/commit/3bcf2d5989490a0316ca8b7d83e4c9724cff33a3))
* **sdk:** pro license setup in cli defaults to false ([#53655](https://github.com/metabase/metabase/issues/53655)) ([af7227e](https://github.com/metabase/metabase/commit/af7227e8d94eb0675654b63e2c009e30e748622a))
* **sdk:** show clarification messages upon running the cli ([#53471](https://github.com/metabase/metabase/issues/53471)) ([e81a4d3](https://github.com/metabase/metabase/commit/e81a4d38083c08ca126ae08fc48a983c6f96af2f))



## [0.53.1-nightly](https://github.com/metabase/metabase/compare/embedding-sdk-0.52.4-nightly...embedding-sdk-0.53.1-nightly) (2025-01-13)


### Bug Fixes

* **sdk:** add supports for xx-YY locales in embed/public-links and sdk ([#51002](https://github.com/metabase/metabase/issues/51002)) ([bda324e](https://github.com/metabase/metabase/commit/bda324e42b76e6b2b6b9e99e5175cc3466fe5ea9))
* **sdk:** Control stacking without distinct z-indexes ([#49442](https://github.com/metabase/metabase/issues/49442)) ([93a703a](https://github.com/metabase/metabase/commit/93a703a9118418c4bc8b5d8b111875b8a9f2456a)), closes [#51256](https://github.com/metabase/metabase/issues/51256) [#45468](https://github.com/metabase/metabase/issues/45468) [#49466](https://github.com/metabase/metabase/issues/49466) [#50943](https://github.com/metabase/metabase/issues/50943) [#50971](https://github.com/metabase/metabase/issues/50971) [#45469](https://github.com/metabase/metabase/issues/45469) [#48256](https://github.com/metabase/metabase/issues/48256)
* **sdk:** Ensure that styles within the custom expression editor still work ([#51878](https://github.com/metabase/metabase/issues/51878)) ([48f8769](https://github.com/metabase/metabase/commit/48f876956a171d8fc6e15e19c4d905265a1d2fb3))
* **sdk:** migrate to custom redux context to allow using the sdk on host apps that use redux ([#51382](https://github.com/metabase/metabase/issues/51382)) ([ec2f229](https://github.com/metabase/metabase/commit/ec2f229fe18619106001af2b5c8b144dfe8696f2))
* **sdk:** update define function names in Next.js compat ([#51071](https://github.com/metabase/metabase/issues/51071)) ([00a087b](https://github.com/metabase/metabase/commit/00a087bb52e8f3bdd7d56cf1fca7e7bf7133f6a5))


### Features

* **sdk:** Interactive Question Chart Settings Dropdown [#50976](https://github.com/metabase/metabase/issues/50976) ([08f0bf8](https://github.com/metabase/metabase/commit/08f0bf86aabcd3c3f6874aea3bda5cb408b7adaa))
* **sdk:** make editable dashboard grid border color themeable ([#51060](https://github.com/metabase/metabase/issues/51060)) ([1a8e613](https://github.com/metabase/metabase/commit/1a8e6132b276383e8c2c92671ebfa88696358cb0))



## [0.52.4-nightly](https://github.com/metabase/metabase/compare/embedding-sdk-0.52.3-nightly...embedding-sdk-0.52.4-nightly) (2024-12-16)


### Bug Fixes

* **sdk:** Fix alignment of ColorSelector in SDK Chart Settings ([#51000](https://github.com/metabase/metabase/issues/51000)) ([4bbd4cc](https://github.com/metabase/metabase/commit/4bbd4cc2aadd7c702ce09622badb5b859c2aa130))
* **sdk:** introduce `.mb-wrapper` to scope down our css ([#50466](https://github.com/metabase/metabase/issues/50466)) ([2d9d447](https://github.com/metabase/metabase/commit/2d9d4474925830ee427b3bb6c07d45c6e362e029))
* **sdk:** remove Error.captureStackTrace as it errors on firefox ([#50773](https://github.com/metabase/metabase/issues/50773)) ([4c27ad5](https://github.com/metabase/metabase/commit/4c27ad5fa36507f180696313cd39ec000989f3bb))
* **sdk:** wrap InteractiveDashboard with renderOnlyInSdkProvider ([#51224](https://github.com/metabase/metabase/issues/51224)) ([86b994e](https://github.com/metabase/metabase/commit/86b994e7a5d56cff460ad7bcd670ecfefead6652))


### Features

* **sdk:** add style and className to static dashboards ([#50860](https://github.com/metabase/metabase/issues/50860)) ([3391546](https://github.com/metabase/metabase/commit/33915469e39f158e64eae3f4f26e6fe6b82ac468))
* **sdk:** add withChartTypeSelector prop to InteractiveQuestion ([#50664](https://github.com/metabase/metabase/issues/50664)) ([6e407f1](https://github.com/metabase/metabase/commit/6e407f15aacfdf97bc92eaf7669ba682d14ad04d))
* **sdk:** combine title props in interactive question ([#50660](https://github.com/metabase/metabase/issues/50660)) ([fba8aab](https://github.com/metabase/metabase/commit/fba8aab8ac2dff97b9e737e061ff48d6263266e2))
* **sdk:** detect if session.id is not a string ([#50890](https://github.com/metabase/metabase/issues/50890)) ([179554e](https://github.com/metabase/metabase/commit/179554e5640d8c5c831027e029d7a3dcc3c7ef8e))
* **sdk:** Modify Interactive Question Layout ([#50152](https://github.com/metabase/metabase/issues/50152)) ([b88e743](https://github.com/metabase/metabase/commit/b88e7431b6b7c6699d396aae8c97fe4c7fa7454b))
* **sdk:** move non-auth config options to provider ([#50585](https://github.com/metabase/metabase/issues/50585)) ([9f3e0bc](https://github.com/metabase/metabase/commit/9f3e0bc68acd572f3f7cc690649c3a6166ca48ab))
* **sdk:** next sdk compatibility layer ([#50230](https://github.com/metabase/metabase/issues/50230)) ([c0eab44](https://github.com/metabase/metabase/commit/c0eab4452eb50fe9fce915b27d00f64e3b8ee710)), closes [#50736](https://github.com/metabase/metabase/issues/50736)
* **sdk:** rename prop names to be clear and explicit ([#50656](https://github.com/metabase/metabase/issues/50656)) ([35ec452](https://github.com/metabase/metabase/commit/35ec452c6ccc1a0751e0b1842e7d0a094cb48ccc))
* **sdk:** support sql parameters in interactive questions ([#50728](https://github.com/metabase/metabase/issues/50728)) ([5313e01](https://github.com/metabase/metabase/commit/5313e018e80705f689a0bcabcc7bb3fa50bab026))
* **sdk:** use metabase type prefix and re-export types ([#50862](https://github.com/metabase/metabase/issues/50862)) ([c40657f](https://github.com/metabase/metabase/commit/c40657ff3ac437a69c08ca910d9bbcd814fed7ff))
* **sdk:** use public-facing question type in event handlers ([#50867](https://github.com/metabase/metabase/issues/50867)) ([dbd60f5](https://github.com/metabase/metabase/commit/dbd60f5c4751ce9b0d6301609502aa491ef25bb5))
* **sdk:** use string types for specifying entity ids instead of internal nanoid type ([#50663](https://github.com/metabase/metabase/issues/50663)) ([87b60ba](https://github.com/metabase/metabase/commit/87b60ba547f95020afcf4be5bc8da9196cb35f96))



## [0.52.3-nightly](https://github.com/metabase/metabase/compare/embedding-sdk-0.52.2-nightly...embedding-sdk-0.52.3-nightly) (2024-11-29)


### Bug Fixes

* **sdk:** entity picker theming fixes ([#50449](https://github.com/metabase/metabase/issues/50449)) ([90979e9](https://github.com/metabase/metabase/commit/90979e9abd35cc2310d289ff81438e94392b2169))
* **sdk:** entity picker's hover and accent colors are not mappable via sdk theming ([#50299](https://github.com/metabase/metabase/issues/50299)) ([5f6b9ec](https://github.com/metabase/metabase/commit/5f6b9ecb17a504db891f1a3a868b98a763696307))
* **sdk:** make modals use the correct portal ([#50565](https://github.com/metabase/metabase/issues/50565)) ([fb0cf74](https://github.com/metabase/metabase/commit/fb0cf744e771a233412e418d0c7e2790c01e642c))
* **sdk:** show loader right after visualizing in notebook editor for the first time ([#50411](https://github.com/metabase/metabase/issues/50411)) ([7828b5e](https://github.com/metabase/metabase/commit/7828b5e2911b1779aa76e461cc05d36d107fc6c8))
* **sdk:** summarize sdk component crashes with stage index errors ([#50400](https://github.com/metabase/metabase/issues/50400)) ([5317db6](https://github.com/metabase/metabase/commit/5317db6d60000ea3911537d56831f04ebb18507a))


### Features

* **sdk:** Add cross-version e2e tests using a published SDK package ([#50423](https://github.com/metabase/metabase/issues/50423)) ([1686e8a](https://github.com/metabase/metabase/commit/1686e8a6921cfe5280c56e48f4b42987a2c236ac))
* **sdk:** make tooltips themeable ([#50457](https://github.com/metabase/metabase/issues/50457)) ([8c2b6e8](https://github.com/metabase/metabase/commit/8c2b6e8945a8a52f1212b5c4ee75d9ee1cddb3d9))
* **sdk:** migrate existing sdk tests to cypress component testing ([0751632](https://github.com/metabase/metabase/commit/075163202f2bea781ae675bb1140ad12e462466e))



## [0.52.2-nightly](https://github.com/metabase/metabase/compare/embedding-sdk-0.52.1-nightly...embedding-sdk-0.52.2-nightly) (2024-11-21)


### Bug Fixes

* **sdk:** cli suggests a relative import path with reminder message ([#50276](https://github.com/metabase/metabase/issues/50276)) ([43ffbf0](https://github.com/metabase/metabase/commit/43ffbf0b24a631ee3e13416b572b97314c70412f))
* **sdk:** Convert jwtProviderUri to authProviderUri ([#49843](https://github.com/metabase/metabase/issues/49843)) ([d2d95df](https://github.com/metabase/metabase/commit/d2d95df948fe03befb825180f8bf1d22c233cf35))
* **sdk:** emit typescript files in the embedding cli when in a typescript project ([#50278](https://github.com/metabase/metabase/issues/50278)) ([3f2f855](https://github.com/metabase/metabase/commit/3f2f855cd0810c6b27351d916df924ce4ac3f81a))
* **sdk:** Fix visualization default size ([#49672](https://github.com/metabase/metabase/issues/49672)) ([652fafe](https://github.com/metabase/metabase/commit/652fafea3c093f189936cddecbbad103d322bdcc))
* **sdk:** fix wrong e2e import path causing ci failure ([#50297](https://github.com/metabase/metabase/issues/50297)) ([64219be](https://github.com/metabase/metabase/commit/64219be8130318fca821e243de2d9503a92938ff))
* **sdk:** generated cli components has inconsistent styles after the style leak fix ([#49723](https://github.com/metabase/metabase/issues/49723)) ([df32101](https://github.com/metabase/metabase/commit/df321012c381a10d1d133eac0ef08d7d564aac5b))
* **sdk:** handle relative urls for metabaseInstance in loading maps ([#50135](https://github.com/metabase/metabase/issues/50135)) ([3f77c0c](https://github.com/metabase/metabase/commit/3f77c0c4801673b81f889533d32f2ef4e6491dc9))
* **sdk:** put a bandage on the flashing error on static question in strict mode ([#49659](https://github.com/metabase/metabase/issues/49659)) ([c57b3a3](https://github.com/metabase/metabase/commit/c57b3a38e0ec25f13127652b74751837d908f664))
* **sdk:** remove `Cannot update a component XX while rendering a ([#50078](https://github.com/metabase/metabase/issues/50078)) ([6c0d44d](https://github.com/metabase/metabase/commit/6c0d44d1ca138cf4de772188ec085124c51b0dd3))
* **sdk:** sdk version wrapped in quotes ([#50014](https://github.com/metabase/metabase/issues/50014)) ([f707115](https://github.com/metabase/metabase/commit/f707115294f124cbe397a6331143813d96aaf29e))
* **sdk:** Split `useSummarizeQuery` into specialized hooks ([#49841](https://github.com/metabase/metabase/issues/49841)) ([4761766](https://github.com/metabase/metabase/commit/47617667380eccdd16d207391b62edda3142df54))
* **sdk:** trigger save handler on question create when using SaveQuestionForm ([#50137](https://github.com/metabase/metabase/issues/50137)) ([964d31e](https://github.com/metabase/metabase/commit/964d31ec8d7e03ee80fc860bee57cc8da31a2a2c))


### Features

* **sdk:** ability to render question layout when drilling down in interactive dashboard ([#50017](https://github.com/metabase/metabase/issues/50017)) ([5bbb9f8](https://github.com/metabase/metabase/commit/5bbb9f847a66694042c3b0de26df6d356d9a388a))
* **sdk:** add background-disabled color ([#49900](https://github.com/metabase/metabase/issues/49900)) ([aaedddf](https://github.com/metabase/metabase/commit/aaedddf82868f3da852b57073e06a23e81c6bc82))
* **sdk:** Add chart settings to `InteractiveQuestion` ([#49167](https://github.com/metabase/metabase/issues/49167)) ([a4828dc](https://github.com/metabase/metabase/commit/a4828dc9e293312deb903a9c22f4b701770d5837))
* **sdk:** deprecate the ModifyQuestion component ([#49747](https://github.com/metabase/metabase/issues/49747)) ([6c8edfa](https://github.com/metabase/metabase/commit/6c8edfa7d3687a8ca338175a1616e9ac5cfae031))
* **sdk:** detect mismatch between sdk version and mb version ([#50032](https://github.com/metabase/metabase/issues/50032)) ([ceba6e4](https://github.com/metabase/metabase/commit/ceba6e407caba565e893cbc605be37bfa8ae3d04))
* **sdk:** expose FilterPicker querying component ([#49768](https://github.com/metabase/metabase/issues/49768)) ([69f6527](https://github.com/metabase/metabase/commit/69f6527edd9815b8a384ae5819ca3427d05c2ac2))
* **sdk:** revamp CreateQuestion and create question behaviour ([#50088](https://github.com/metabase/metabase/issues/50088)) ([5fb9576](https://github.com/metabase/metabase/commit/5fb95767da63c36a1b9d2f47afd8eb4937f2c952))
* **sdk:** use Alert component for SDKError ([#49895](https://github.com/metabase/metabase/issues/49895)) ([8516149](https://github.com/metabase/metabase/commit/85161494a9c89316f081e73d07dcf3aa86212817))



## [0.52.1](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.38...embedding-sdk-0.52.1-nightly) (2024-11-07)


### Bug Fixes

* **sdk:** ability to save questions in interactive question ([#48866](https://github.com/metabase/metabase/issues/48866)) ([e99c67a](https://github.com/metabase/metabase/commit/e99c67a1532b34f0396c5e9f4a7cc30c1c731858))
* **sdk:** Change QuestionEditor tab name to 'Editor' ([#48821](https://github.com/metabase/metabase/issues/48821)) ([405ed53](https://github.com/metabase/metabase/commit/405ed53baa5a3346e7ac253fc8cd8e7bf9a72dff))
* **sdk:** Editable dashboard should not overlap content below it ([#49293](https://github.com/metabase/metabase/issues/49293)) ([548a9a7](https://github.com/metabase/metabase/commit/548a9a7433f7ed47049faaf1e3773f93d3b6e356))
* **sdk:** fix defaultProps react error ([#48764](https://github.com/metabase/metabase/issues/48764)) ([9ffc185](https://github.com/metabase/metabase/commit/9ffc1851eaf333904089d06ef0fe68f1d987c72b))
* **sdk:** Fix interactive dashboard scroll in fullscreen mode ([#49366](https://github.com/metabase/metabase/issues/49366)) ([5879f90](https://github.com/metabase/metabase/commit/5879f90bfa601fe3a35db153d86cac4d0c1dcc58))
* **sdk:** hide downloads by default ([#48755](https://github.com/metabase/metabase/issues/48755)) ([f481cad](https://github.com/metabase/metabase/commit/f481cad33787298bfbddd1d665dde9740f0eb64d))
* **sdk:** Improve InteractiveQuestion chart selector ([#48837](https://github.com/metabase/metabase/issues/48837)) ([70904e8](https://github.com/metabase/metabase/commit/70904e8cd938eea01eb3692c409a0ef26aecfbf6))
* **sdk:** pin iframe-resizer version to avoid excess logs for sdk cli ([#49312](https://github.com/metabase/metabase/issues/49312)) ([cf934f9](https://github.com/metabase/metabase/commit/cf934f928dcf0990805ca9db5edafa57d14b73d8))
* **sdk:** reduce visual artifacts on PDF/PNG exports on custom sdk themes ([#48645](https://github.com/metabase/metabase/issues/48645)) ([d91bbcd](https://github.com/metabase/metabase/commit/d91bbcd4891050908c8b6a9dd901bfb04b7f9fa8))
* **sdk:** remove runtime error on aggregated question drill ([#49064](https://github.com/metabase/metabase/issues/49064)) ([df158d8](https://github.com/metabase/metabase/commit/df158d8896d46b817d23884297146a875d45f97d))
* **sdk:** static question should cancel requests on component unmount ([#48808](https://github.com/metabase/metabase/issues/48808)) ([2fd311c](https://github.com/metabase/metabase/commit/2fd311c521bfa1491da6ef196d9aed0d741d1d5c))
* **sdk:** support hiding columns in InteractiveQuestion ([#49013](https://github.com/metabase/metabase/issues/49013)) ([6a927de](https://github.com/metabase/metabase/commit/6a927deefb44f4ef390600d1dbcda1de72b4d2d7))


### Features

* **sdk:** `defineEmbeddingSdkConfig` to make typing easier ([#48879](https://github.com/metabase/metabase/issues/48879)) ([aa72eb8](https://github.com/metabase/metabase/commit/aa72eb83aebd2adc3dbd700d28f1b7d18b2e0987))
* **sdk:** ability to enforce the destination collection to save to and hide the collection picker ([#49251](https://github.com/metabase/metabase/issues/49251)) ([de559f4](https://github.com/metabase/metabase/commit/de559f49d6dc245bc35d73d373a3cbba3c8062e4))
* **sdk:** Add `isOpen` prop to control CreateDashboardModal visibility ([#49452](https://github.com/metabase/metabase/issues/49452)) ([9f49d1a](https://github.com/metabase/metabase/commit/9f49d1aa141f5bb291eb10a0b0549f30e8daa081))
* **sdk:** Add chart viz selection for `InteractiveQuestion` ([#47744](https://github.com/metabase/metabase/issues/47744)) ([a288c15](https://github.com/metabase/metabase/commit/a288c15e579975cd3ed783cd6c18f39a84445c41))
* **sdk:** Allow to hide columns in CollectionBrowser ([#49449](https://github.com/metabase/metabase/issues/49449)) ([839b713](https://github.com/metabase/metabase/commit/839b713f50e2c1696923dc3e1cf0b5091537272f))
* **sdk:** refactor the auth code to provide better error messages ([#49214](https://github.com/metabase/metabase/issues/49214)) ([6452cd3](https://github.com/metabase/metabase/commit/6452cd3c17089ad8675b25bdf76ec4284ce3c32e)), closes [#49492](https://github.com/metabase/metabase/issues/49492)
* **sdk:** small usability improvements for embedding cli ([#49591](https://github.com/metabase/metabase/issues/49591)) ([dba17e6](https://github.com/metabase/metabase/commit/dba17e6c3699b37da8bcb747688a9f5f24f74ff7))



## [0.1.38](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.37...embedding-sdk-0.1.38) (2024-10-09)


### Bug Fixes

* **sdk:** allow CLI to check React version without installing and allow continuing setup if React is missing ([#48491](https://github.com/metabase/metabase/issues/48491)) ([000dfe1](https://github.com/metabase/metabase/commit/000dfe1bf44f0a0b2280633e02b242554d2b75ef))
* **sdk:** Attempt to fix resize observer issues ([#48227](https://github.com/metabase/metabase/issues/48227)) ([77cb69f](https://github.com/metabase/metabase/commit/77cb69f88e23c2cad1ff3c906b50ffaab9ff3770))
* **sdk:** update utm tags in embedding sdk cli ([#48419](https://github.com/metabase/metabase/issues/48419)) ([74be2dc](https://github.com/metabase/metabase/commit/74be2dcce507b8f1f032eb065bca93a985301138))


### Features

* **sdk:** support `locale` prop on `MetabaseProvider` ([#47569](https://github.com/metabase/metabase/issues/47569)) ([70a8ab7](https://github.com/metabase/metabase/commit/70a8ab70a8b58ac52dc89108c24f4d098a00810f))



# [0.51.0](https://github.com/metabase/metabase/compare/embedding-sdk-0.1.37...embedding-sdk-0.51.0) (2024-10-08)


### Bug Fixes

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
