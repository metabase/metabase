(ns metabase.lib.test-util.huge-query-metadata-providers
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.test-util.metadata-providers.mock :as mock]
   [metabase.util :as u]))

(def ^:private field-essentials-5237
  [[102745 nil :type/Text :search nil]
   [102711 nil :type/Text :search nil]
   [102734 nil :type/Text :search nil]
   [102724 nil :type/Text :search nil]
   [102729 :type/FK :type/Text :search 84450]
   [102700 :type/FK :type/Text :search 85585]
   [102739 :type/FK :type/Text :search 85200]
   [102706 :type/FK :type/Text :search 85738]
   [102744 :type/FK :type/Text :search 82794]
   [102741 :type/FK :type/Text :search 82794]
   [102742 :type/FK :type/Text :list 85465]
   [102718 nil :type/Text :search nil]
   [102719 nil :type/Text :search nil]
   [102704 :type/CreationTimestamp :type/DateTime :none nil]
   [102733 nil :type/Date :none nil]
   [104690 nil :type/Date :none nil]
   [104689 nil :type/Date :none nil]
   [102726 :type/CreationDate :type/Date :none nil]
   [102713 nil :type/DateTime :none nil]
   [102723 :type/Source :type/Text :list nil]
   [104654 :type/Category :type/Text :list nil]
   [102709 :type/Category :type/Number :list nil]
   [102735 :type/Category :type/Number :list nil]
   [102714 nil :type/Number :list nil]
   [102708 nil :type/Number :list nil]
   [102730 nil :type/Number :none nil]
   [102722 :type/Country :type/Text :list nil]
   [102701 :type/Category :type/Text :list nil]
   [102712 :type/Category :type/Text :list nil]
   [102705 :type/Category :type/Text :list nil]
   [102740 :type/Category :type/Text :list nil]
   [105339 :type/Category :type/Text :list nil]
   [105343 nil :type/Text :list nil]
   [104510 :type/Category :type/Number :list nil]
   [104504 :type/Category :type/Number :list nil]
   [104511 :type/Category :type/Number :list nil]
   [104503 :type/Category :type/Number :list nil]
   [104505 :type/Category :type/Number :list nil]
   [102703 :type/Category :type/Number :list nil]
   [104508 :type/Category :type/Number :list nil]
   [104506 :type/Category :type/Number :list nil]
   [102715 :type/Category :type/Number :list nil]
   [104509 :type/Category :type/Number :list nil]
   [104501 :type/Category :type/Number :list nil]
   [102702 :type/Category :type/Number :list nil]
   [104502 :type/Category :type/Number :list nil]
   [104507 :type/Category :type/Number :list nil]
   [104542 :type/Category :type/Number :list nil]
   [104541 :type/Category :type/Number :list nil]
   [104543 :type/Category :type/Number :list nil]
   [104546 :type/Category :type/Number :list nil]
   [102707 :type/Category :type/Text :list nil]
   [102710 :type/Category :type/Text :list nil]
   [102736 :type/Category :type/Text :list nil]
   [102732 :type/Category :type/Text :list nil]
   [102731 nil :type/Text :list nil]
   [102743 nil :type/Text :search nil]
   [102727 :type/URL :type/Text :search nil]
   [102720 nil :type/Text :list nil]
   [102725 :type/Source :type/Text :list nil]
   [102721 :type/Category :type/Text :list nil]
   [102717 nil :type/Text :search nil]
   [102737 nil :type/Text :search nil]
   [102716 nil :type/Text :search nil]
   [102738 nil :type/Text :list nil]
   [109783 :type/Category :type/Text :list nil]
   [109782 :type/Category :type/Text :list nil]
   [110700 :type/Category :type/Text :list nil]
   [105005 :type/Category :type/Number :list nil]])

(def ^:private field-essentials-4360
  [[82702 :type/FK :type/Text :search 85585]
   [82711 :type/FK :type/Text :search 84450]
   [99576 nil :type/Text :search nil]
   [108200 nil :type/Text :list nil]
   [82675 :type/FK :type/Text :search 85738]
   [99865 :type/FK :type/Text :list 85465]
   [99574 :type/FK :type/Text :search 82794]
   [99575 :type/FK :type/Text :search 82794]
   [108202 nil :type/Text :search nil]
   [109707 nil :type/Text :list nil]
   [110401 :type/URL :type/Text :list nil]
   [110697 :type/Category :type/Text :list nil]
   [82718 :type/CreationDate :type/Date :none nil]
   [107766 nil :type/DateTime :none nil]
   [82705 nil :type/Date :none nil]
   [107765 nil :type/DateTime :none nil]
   [108376 nil :type/DateTime :none nil]
   [82726 nil :type/Date :none nil]
   [102769 nil :type/DateTime :none nil]
   [102011 nil :type/DateTime :none nil]
   [82682 :type/Source :type/Text :list nil]
   [82695 :type/Enum :type/Text :list nil]
   [82721 :type/Category :type/Text :list nil]
   [107726 :type/Email :type/Text :search nil]
   [82706 :type/Category :type/Text :list nil]
   [82674 :type/Category :type/Text :list nil]
   [82678 :type/Category :type/Text :list nil]
   [82717 :type/Category :type/Text :list nil]
   [82697 :type/CreationDate :type/Date :none nil]
   [82707 nil :type/Date :none nil]
   [82684 nil :type/Date :none nil]
   [82693 :type/Category :type/Number :list nil]
   [82685 :type/Category :type/Number :list nil]
   [82699 :type/Category :type/Number :list nil]
   [82691 :type/Category :type/Number :list nil]
   [82677 :type/Category :type/Number :list nil]
   [82725 :type/Category :type/Number :list nil]
   [108818 :type/Category :type/Number :list nil]
   [82694 :type/Category :type/Number :list nil]
   [82722 :type/Category :type/Number :list nil]
   [82676 :type/Category :type/Number :list nil]
   [82719 :type/Category :type/Number :list nil]
   [82688 :type/Category :type/Number :list nil]
   [82704 :type/Category :type/Number :list nil]
   [82679 :type/Category :type/Number :list nil]
   [82714 :type/Category :type/Number :list nil]
   [82698 :type/Category :type/Number :list nil]
   [82681 :type/Category :type/Number :list nil]
   [82708 :type/Category :type/Number :list nil]
   [82689 :type/Category :type/Number :list nil]
   [82709 :type/Category :type/Number :list nil]
   [82700 :type/Category :type/Number :list nil]
   [82716 :type/Source :type/Text :list nil]
   [82683 :type/Category :type/Text :list nil]
   [82712 :type/Category :type/Number :list nil]
   [82696 :type/Category :type/Text :list nil]
   [82703 :type/Category :type/Text :list nil]
   [82686 :type/Category :type/Text :list nil]
   [82723 :type/Category :type/Text :list nil]
   [82680 :type/City :type/Text :list nil]
   [82713 nil :type/Text :search nil]
   [91802 :type/Category :type/Number :list nil]
   [91804 :type/Category :type/Number :list nil]
   [91803 :type/Category :type/Number :list nil]
   [98982 nil :type/Text :search nil]
   [98973 :type/Source :type/Text :list nil]
   [98978 nil :type/Text :search nil]
   [98975 nil :type/Text :search nil]
   [98985 :type/Category :type/Text :list nil]
   [98981 nil :type/Text :search nil]
   [98980 :type/Source :type/Text :list nil]
   [98984 nil :type/Text :search nil]
   [104228 nil :type/Text :list nil]
   [98979 nil :type/Text :search nil]
   [98976 :type/Source :type/Text :list nil]
   [98983 nil :type/Text :search nil]
   [98987 nil :type/Text :search nil]
   [98977 nil :type/Text :list nil]
   [98988 nil :type/Text :search nil]
   [98986 :type/Source :type/Text :list nil]
   [98974 nil :type/Text :search nil]
   [104229 nil :type/Text :list nil]
   [105093 nil :type/Text :search nil]
   [99848 :type/Category :type/Text :list nil]
   [99847 :type/Category :type/Text :list nil]
   [103239 :type/Category :type/Number :list nil]
   [108949 :type/Category :type/Text :list nil]
   [108378 :type/Category :type/Number :list nil]
   [108380 :type/Category :type/Text :list nil]
   [108379 :type/JoinTimestamp :type/DateTime :none nil]
   [108377 :type/CancelationTimestamp :type/DateTime :none nil]
   [108381 :type/Category :type/Text :list nil]
   [108382 :type/Quantity :type/Float :none nil]
   [100531 nil :type/Float :none nil]
   [100532 nil :type/Float :none nil]
   [100530 nil :type/Float :none nil]
   [100529 nil :type/Float :none nil]
   [110336 :type/Source :type/Text :list nil]
   [100905 nil :type/Text :list nil]
   [109708 :type/Category :type/Text :list nil]
   [108948 :type/Category :type/Text :list nil]
   [82673 nil :type/DateTime :none nil]
   [99155 :type/Source :type/Text :list nil]
   [99156 :type/Source :type/Text :list nil]])

(def ^:private field-essentials-4263
  [[85585 :type/PK :type/Text :search nil]
   [85588 :type/FK :type/Text :search 84450]
   [85644 :type/FK :type/Text :search nil]
   [85530 :type/FK :type/Text :search nil]
   [85732 :type/FK :type/Text :list 96021]
   [109344 :type/FK :type/Text :list 96021]
   [85542 :type/FK :type/Text :search 82620]
   [85553 :type/FK :type/Text :search 85200]
   [85696 :type/FK :type/Text :list 85465]
   [85590 :type/FK :type/Text :search nil]
   [85575 :type/FK :type/Text :search 84289]
   [92254 nil :type/Text :search nil]
   [85566 :type/FK :type/Text :search nil]
   [85735 :type/FK :type/Text :list 85465]
   [85714 :type/FK :type/Text :list 85465]
   [85568 :type/FK :type/Text :list 85465]
   [85610 :type/FK :type/Text :list 108368]
   [85693 :type/FK :type/Text :list 86536]
   [99584 :type/FK :type/Text :search 82794]
   [85527 :type/FK :type/Text :search 85738]
   [85569 :type/FK :type/Text :search 85738]
   [108817 :type/Category :type/Number :list nil]
   [103562 :type/Category :type/Text :list nil]
   [103270 :type/Category :type/Text :list nil]
   [85708 nil :type/Date :none nil]
   [85699 nil :type/DateTime :none nil]
   [85673 nil :type/DateTime :none nil]
   [85574 :type/CreationDate :type/Date :none nil]
   [85709 nil :type/Date :none nil]
   [85582 :type/CreationTimestamp :type/DateTime :none nil]
   [85609 nil :type/DateTime :none nil]
   [85577 nil :type/DateTime :none nil]
   [85647 nil :type/DateTime :none nil]
   [85572 nil :type/DateTime :none nil]
   [85685 nil :type/DateTime :none nil]
   [85734 nil :type/Date :none nil]
   [85557 nil :type/DateTime :none nil]
   [85650 nil :type/DateTime :none nil]
   [85727 nil :type/DateTime :none nil]
   [85581 nil :type/DateTime :none nil]
   [85602 nil :type/DateTime :none nil]
   [85716 nil :type/DateTime :none nil]
   [85702 nil :type/Date :none nil]
   [103237 nil :type/DateTime :none nil]
   [103236 nil :type/DateTime :none nil]
   [103437 nil :type/DateTime :none nil]
   [103438 nil :type/DateTime :none nil]
   [85626 :type/Category :type/Text :list nil]
   [85559 :type/Description :type/Text :search nil]
   [85718 nil :type/Float :none nil]
   [85580 nil :type/Text :list nil]
   [85595 :type/Category :type/Number :list nil]
   [85658 :type/Category :type/Number :list nil]
   [85694 :type/Category :type/Text :list nil]
   [85628 :type/Category :type/Text :list nil]
   [85615 nil :type/Boolean :list nil]
   [85587 nil :type/Boolean :list nil]
   [85608 nil :type/Boolean :list nil]
   [85677 nil :type/Boolean :list nil]
   [85578 nil :type/Boolean :list nil]
   [85613 nil :type/Boolean :list nil]
   [85556 nil :type/Boolean :list nil]
   [85643 :type/Source :type/Text :list nil]
   [85721 :type/Name :type/Text :search nil]
   [85731 nil :type/Text :search nil]
   [85539 :type/Category :type/Text :list nil]
   [85540 nil :type/Float :none nil]
   [85662 :type/Category :type/Text :list nil]
   [85554 nil :type/Text :list nil]
   [85661 nil :type/Text :search nil]
   [108203 :type/Category :type/Number :list nil]
   [85535 nil :type/Float :none nil]
   [85683 :type/Category :type/Text :list nil]
   [85558 nil :type/Float :none nil]
   [85592 :type/Source :type/Text :search nil]
   [91931 nil :type/Float :none nil]
   [85621 nil :type/Boolean :list nil]
   [108210 :type/Category :type/Text :list nil]
   [108205 :type/Category :type/Text :list nil]
   [103557 :type/Category :type/Text :list nil]
   [85604 nil :type/Text :list nil]
   [85579 nil :type/Boolean :list nil]
   [102588 :type/Category :type/Text :list nil]
   [85616 :type/Category :type/Text :list nil]
   [85634 :type/Category :type/Text :list nil]
   [85654 nil :type/Float :none nil]
   [103235 :type/Category :type/Text :list nil]
   [85544 nil :type/Float :none nil]
   [85584 nil :type/Float :none nil]
   [85670 :type/Category :type/Text :list nil]
   [85648 nil :type/Float :none nil]
   [85583 nil :type/Float :none nil]
   [108207 :type/Category :type/Text :list nil]
   [108206 :type/Category :type/Text :list nil]
   [85646 nil :type/Float :none nil]
   [85657 :type/Category :type/Text :list nil]
   [85565 :type/Category :type/Text :list nil]
   [85660 :type/Category :type/Text :list nil]
   [85725 :type/Category :type/Text :list nil]
   [91923 :type/Category :type/Text :list nil]
   [85687 :type/Category :type/Text :list nil]
   [85625 nil :type/Boolean :list nil]
   [85547 :type/Category :type/Text :list nil]
   [85649 nil :type/Float :none nil]
   [85533 nil :type/Float :none nil]
   [85680 nil :type/Text :search nil]
   [85537 nil :type/Text :search nil]
   [85729 :type/Category :type/Text :list nil]
   [85600 :type/Category :type/Text :list nil]
   [85576 nil :type/Boolean :list nil]
   [85560 nil :type/Float :none nil]
   [85623 nil :type/Float :none nil]
   [85691 nil :type/Float :none nil]
   [85624 nil :type/Float :none nil]
   [85700 nil :type/Float :none nil]
   [85730 :type/Discount :type/Float :none nil]
   [85573 :type/Discount :type/Float :none nil]
   [85617 nil :type/Text :list nil]
   [85545 nil :type/Float :none nil]
   [85538 nil :type/Float :none nil]
   [85586 :type/Category :type/Text :list nil]
   [85733 :type/Duration :type/Float :none nil]
   [85720 nil :type/Text :search nil]
   [85528 nil :type/Text :search nil]
   [85552 :type/Score :type/Float :none nil]
   [85692 nil :type/Text :list nil]
   [85632 nil :type/Float :none nil]
   [85698 :type/Discount :type/Float :none nil]
   [85532 nil :type/Text :list nil]
   [108208 :type/Category :type/Text :list nil]
   [85707 :type/URL :type/Text :search nil]
   [85689 nil :type/Text :search nil]
   [85711 nil :type/Text :search nil]
   [85561 nil :type/Text :list nil]
   [85536 :type/Category :type/Text :list nil]
   [85663 nil :type/Text :search nil]
   [85637 :type/Source :type/Text :list nil]
   [85651 nil :type/Text :search nil]
   [85642 nil :type/Text :search nil]
   [85645 :type/Category :type/Text :list nil]
   [85724 nil :type/Text :search nil]
   [85686 :type/Source :type/Text :list nil]
   [85607 nil :type/Text :search nil]
   [85524 nil :type/Text :search nil]
   [85589 nil :type/Text :search nil]
   [85679 :type/Category :type/Text :list nil]
   [85601 nil :type/Text :search nil]
   [85678 :type/Source :type/Text :list nil]
   [85690 nil :type/Text :search nil]
   [85523 nil :type/Text :search nil]
   [85603 :type/Category :type/Text :list nil]
   [85639 nil :type/Text :search nil]
   [85635 :type/Source :type/Text :list nil]
   [85706 nil :type/Text :search nil]
   [85550 nil :type/Text :search nil]
   [85682 nil :type/Text :search nil]
   [85684 nil :type/Text :search nil]
   [85695 :type/Category :type/Text :search nil]
   [85522 nil :type/Text :list nil]
   [85598 nil :type/Text :search nil]
   [85551 nil :type/Boolean :list nil]
   [85612 nil :type/Text :search nil]
   [85571 :type/Category :type/Text :list nil]
   [102587 :type/Category :type/Text :list nil]
   [85563 nil :type/Text :list nil]
   [85548 :type/Category :type/Text :list nil]
   [85570 :type/Category :type/Text :list nil]
   [85593 nil :type/Float :none nil]
   [85597 :type/Source :type/Text :list nil]
   [85640 nil :type/Text :list nil]
   [85652 nil :type/Text :search nil]
   [85659 nil :type/Float :none nil]
   [85723 :type/Category :type/Text :list nil]
   [85697 nil :type/Boolean :list nil]
   [85596 nil :type/Float :none nil]
   [85728 nil :type/Float :none nil]
   [85641 nil :type/Boolean :list nil]
   [85688 :type/Category :type/Text :list nil]
   [85620 nil :type/Text :list nil]
   [85655 nil :type/Float :none nil]
   [85710 :type/Category :type/Text :list nil]
   [85564 :type/Owner :type/Text :list nil]
   [85631 :type/Owner :type/Text :list nil]
   [85681 nil :type/Float :none nil]
   [85656 nil :type/Float :none nil]
   [85546 :type/Category :type/Text :list nil]
   [85717 :type/Discount :type/Float :none nil]
   [85605 :type/Discount :type/Float :none nil]
   [85705 nil :type/Text :list nil]
   [85594 nil :type/Text :search nil]
   [85704 :type/Category :type/Text :list nil]
   [85555 :type/Category :type/Text :list nil]
   [85627 nil :type/Text :list nil]
   [110335 :type/Source :type/Text :list nil]
   [85675 nil :type/Text :search nil]
   [85672 nil :type/Text :list nil]
   [85653 :type/Category :type/Text :list nil]
   [85665 :type/Source :type/Text :list nil]
   [85638 nil :type/Text :list nil]
   [85726 nil :type/Float :none nil]
   [85622 nil :type/Text :search nil]
   [102586 nil :type/Float :none nil]
   [85668 nil :type/Float :none nil]
   [108209 :type/Category :type/Number :list nil]
   [85611 nil :type/Boolean :list nil]
   [85619 nil :type/Float :none nil]
   [95976 nil :type/Float :none nil]
   [95975 nil :type/Float :none nil]
   [85701 nil :type/Boolean :list nil]
   [85666 :type/Category :type/Text :list nil]
   [85526 nil :type/Float :none nil]
   [85722 nil :type/Text :search nil]
   [108388 :type/Category :type/Number :list nil]
   [108384 :type/Category :type/Text :list nil]
   [108387 nil :type/DateTime :none nil]
   [108385 nil :type/DateTime :none nil]
   [108386 :type/Category :type/Text :list nil]
   [108383 nil :type/Float :none nil]
   [85719 nil :type/Float :none nil]
   [85534 nil :type/Float :none nil]
   [85629 nil :type/Float :none nil]
   [85599 nil :type/Text :list nil]
   [85618 :type/Owner :type/Text :list nil]
   [108204 nil :type/Text :list nil]
   [103558 :type/Category :type/Text :list nil]
   [103559 :type/Category :type/Text :list nil]
   [103560 nil :type/Text :list nil]
   [103563 nil :type/Text :list nil]
   [103561 :type/Category :type/Text :list nil]
   [85525 :type/Category :type/Text :list nil]
   [85669 nil :type/Float :none nil]
   [85529 :type/Category :type/Text :list nil]
   [85671 :type/Category :type/Text :list nil]
   [85549 :type/URL :type/Text :list nil]
   [85636 :type/Category :type/Text :list nil]
   [85674 nil :type/Boolean :list nil]
   [95977 nil :type/Float :none nil]
   [85667 nil :type/Float :none nil]
   [85715 :type/Category :type/Text :list nil]
   [85676 nil :type/Float :none nil]
   [103943 :type/Category :type/Text :list nil]
   [85664 :type/Category :type/Text :list nil]
   [85703 :type/Category :type/Text :list nil]
   [85614 nil :type/Text :search nil]
   [85562 :type/Category :type/Text :list nil]
   [85633 :type/Email :type/Text :search nil]
   [85712 nil :type/Float :none nil]
   [85567 nil :type/Text :search nil]
   [85521 nil :type/Text :search nil]
   [85630 :type/Category :type/Text :list nil]
   [85713 :type/Category :type/Text :list nil]
   [85606 :type/Category :type/Text :list nil]
   [85591 nil :type/DateTime :none nil]])

(def ^:private field-essentials-5849
  [[104666 nil :type/Date :none nil]
   [104668 nil :type/Text :list nil]
   [104665 nil :type/Text :list nil]
   [104664 nil :type/Text :list nil]
   [104667 nil :type/Float :none nil]
   [104923 nil :type/Number :none nil]
   [104922 nil :type/Number :list nil]
   [108618 nil :type/Float :none nil]
   [110631 nil :type/Float :none nil]
   [110796 nil :type/Float :none nil]
   [110797 nil :type/Float :none nil]
   [110798 nil :type/Float :none nil]])

(def ^:private tables
  [{:lib/type                :metadata/table
    :id                      5237
    :db-id                   179
    :schema                  "DBT_METRICS"
    :name                    "ATTRIBUTION_MODEL"
    :display-name            "ATTRIBUTION_MODEL"
    :description             nil
    :entity-type             :entity/GenericTable
    :initial-sync-status     :complete
    :caveats                 nil
    :field-order             :database
    :active                  true
    :view-count              3000}
   {:lib/type                :metadata/table
    :id                      4360
    :db-id                   179
    :schema                  "DBT"
    :name                    "DAILY_APPLICANT_SEGMENT"
    :display-name            "DAILY_APPLICANT_SEGMENT"
    :entity-type             :entity/GenericTable
    :initial-sync-status     :complete
    :caveats                 nil
    :field-order             :database
    :active                  true
    :view-count              71298}
   {:lib/type                :metadata/table
    :id                      4263
    :db-id                   179
    :schema                  "DBT_SALES"
    :name                    "DAILY_SALES_OPPORTUNITY"
    :display-name            "DAILY_SALES_OPPORTUNITY"
    :entity-type             :entity/GenericTable
    :initial-sync-status     :complete
    :caveats                 nil
    :field-order             :database
    :show-in-getting-started false
    :active                  true
    :view-count              186}
   {:lib/type                :metadata/table,
    :id                      5849
    :db-id                   179
    :schema                  "DBT_MARKETING"
    :name                    "ADS_SPEND"
    :display-name            "ADS_SPEND"
    :entity-type             :entity/GenericTable
    :initial-sync-status     :complete
    :caveats                 nil
    :field-order             :database
    :active                  true
    :view-count              97}])

(def ^:private database
  {:cache-field-values-schedule "0 0 7 * * ? *"
   :description                 nil
   :features                    #{:advanced-math-expressions
                                  :basic-aggregations
                                  :binning
                                  :case-sensitivity-string-filter-options
                                  :connection-impersonation
                                  :connection-impersonation-requires-role
                                  :convert-timezone
                                  :database-routing
                                  :date-arithmetics
                                  :datetime-diff
                                  :distinct-where
                                  :expression-aggregations
                                  :expression-literals
                                  :expressions
                                  :expressions/date
                                  :expressions/datetime
                                  :expressions/float
                                  :expressions/integer
                                  :expressions/text
                                  :expressions/today
                                  :fingerprint
                                  :full-join
                                  :identifiers-with-spaces
                                  :inner-join
                                  :jdbc/statements
                                  :left-join
                                  :metadata/key-constraints
                                  :native-parameter-card-reference
                                  :native-parameters
                                  :native-temporal-units
                                  :nested-queries
                                  :now
                                  :parameterized-sql
                                  :percentile-aggregations
                                  :regex
                                  :right-join
                                  :saved-question-sandboxing
                                  :schemas
                                  :set-timezone
                                  :split-part
                                  :standard-deviation-aggregations
                                  :temporal-extract
                                  :test/dynamic-dataset-loading
                                  :test/jvm-timezone-setting
                                  :test/uuids-in-create-table-statements
                                  :upload-with-auto-pk
                                  :window-functions/cumulative
                                  :window-functions/offset}
   :lib/type                    :metadata/database
   :is-on-demand                false
   :timezone                    "UTC"
   :native-permissions          :write
   :is-full-sync                true
   :name                        "Huge Query DB"
   :initial-sync-status         "complete"
   :uploads-enabled             false
   :settings                    nil
   :caveats                     nil
   :dbms-version                {:flavor "Snowflake", :version "9.32.1", :semantic-version [9 32]}
   :is-sample                   false
   :is-attached-dwh             false
   :details                     {:db "userdb"}
   :id                          179
   :is-audit                    false
   :points-of-interest          nil
   :auto-run-queries            false
   :uploads-schema-name         nil
   :creator-id                  829
   :engine                      :snowflake
   :metadata-sync-schedule      "0 0 7 * * ? *"
   :uploads-table-prefix        nil
   :refingerprint               false
   :router-database-id          nil
   :cache-ttl                   24})

(def ^:private card-15002-query
  {:database 179,
   :type :query,
   :query
   {:order-by [[:desc [:aggregation 0]]],
    :source-table 5849,
    :expressions
    {"Campaign type"
     [:case
      [[[:contains [:field 104668 {:base-type :type/Text}] "Event"]
        "Events"]
       [[:contains [:field 104668 {:base-type :type/Text}] "Boost"]
        "Boosted Posts"]
       [[:contains [:field 104668 {:base-type :type/Text}] "Customer1"]
        "B2B - Customer1"]
       [[:contains
         [:lower [:field 104668 {:base-type :type/Text}]]
         "on24"]
        "Events"]
       [[:contains [:field 104668 {:base-type :type/Text}] "Customer2"]
        "Customer 2"]
       [[:contains
         [:field 104668 {:base-type :type/Text}]
         "EmbeddedForms"]
        "Global - Embedded Forms"]
       [[:contains
         [:lower [:field 104668 {:base-type :type/Text}]]
         "Customer3"]
        "Events"]
       [[:contains
         [:lower [:field 104668 {:base-type :type/Text}]]
         "Customer4"]
        "Events"]
       [[:contains [:field 104668 {:base-type :type/Text}] "FP"] "FP"]
       [[:contains [:field 104668 {:base-type :type/Text}] "Webinars"]
        "Events"]
       [[:contains [:field 104668 {:base-type :type/Text}] "B2B"]
        "General B2B"]
       [[:contains [:field 104668 {:base-type :type/Text}] "_MKT"]
        "Global - New Courses"]
       [[:contains [:field 104668 {:base-type :type/Text}] "1Year"]
        "Global - 1Year Bootcamp"]
       [[:contains [:field 104668 {:base-type :type/Text}] "_ML_"]
        "Global - New Courses"]
       [[:contains [:field 104668 {:base-type :type/Text}] "DataScience"]
        "Global - New Courses"]
       [[:contains [:field 104668 {:base-type :type/Text}] "_AI_"]
        "Global - New Courses"]
       [[:contains [:field 104668 {:base-type :type/Text}] "_DV_"]
        "Global - New Courses"]
       [[:ends-with [:field 104668 {:base-type :type/Text}] "_ML"]
        "Global - New Courses"]
       [[:ends-with [:field 104668 {:base-type :type/Text}] "_AI"]
        "Global - New Courses"]
       [[:ends-with [:field 104668 {:base-type :type/Text}] "_DV"]
        "Global - New Courses"]
       [[:contains [:field 104668 {:base-type :type/Text}] "_DA_"]
        "Global - Legacy Courses"]
       [[:contains [:field 104668 {:base-type :type/Text}] "_UX_"]
        "Global - Legacy Courses"]
       [[:contains [:field 104668 {:base-type :type/Text}] "_CY_"]
        "Global - Legacy Courses"]
       [[:contains [:field 104668 {:base-type :type/Text}] "_WD_"]
        "Global - Legacy Courses"]
       [[:ends-with [:field 104668 {:base-type :type/Text}] "_DA"]
        "Global - Legacy Courses"]
       [[:ends-with [:field 104668 {:base-type :type/Text}] "_UX"]
        "Global - Legacy Courses"]
       [[:ends-with [:field 104668 {:base-type :type/Text}] "_CY"]
        "Global - Legacy Courses"]
       [[:ends-with [:field 104668 {:base-type :type/Text}] "_WD"]
        "Global - Legacy Courses"]
       [[:contains [:field 104668 {:base-type :type/Text}] "Global"]
        "Global"]
       [[:contains [:field 104668 {:base-type :type/Text}] "Local"]
        "Local"]
       [[:contains
         [:field 104668 {:base-type :type/Text}]
         "Influencer_AllCourses"]
        "Global"]]],
     "Campaign country"
     [:case
      [[[:contains [:field 104668 {:base-type :type/Text}] "Spain"]
        "Spain"]
       [[:contains [:field 104668 {:base-type :type/Text}] "France"]
        "France"]
       [[:contains [:field 104668 {:base-type :type/Text}] "Portugal"]
        "Portugal"]
       [[:contains [:field 104668 {:base-type :type/Text}] "Netherlands"]
        "Netherlands"]
       [[:contains [:field 104668 {:base-type :type/Text}] "Germany"]
        "Germany"]]],
     "Adset"
     [:case
      [[[:and
         [:= [:field 104665 {:base-type :type/Text}] "Prospecting_Video4"]
         [:= [:field 104668 {:base-type :type/Text}] "Germany_Global_Prospecting_1Year"]]
        "Prospecting_Video4"]
       [[:and
         [:= [:field 104665 {:base-type :type/Text}] "Prospecting_Audience_Interests"]
         [:= [:field 104668 {:base-type :type/Text}] "Spain_Global_Prospecting_FinancingOptions"]]
        "Prospecting_Interests"]
       [[:and
         [:= [:field 104665 {:base-type :type/Text}] "Prospecting_2"]
         [:= [:field 104668 {:base-type :type/Text}] "Spain_Global_Prospecting_FinancingOptions"]]
        "Prospecting_2"]
       [[:and
         [:= [:field 104665 {:base-type :type/Text}] "Prospecting_2b"]
         [:= [:field 104668 {:base-type :type/Text}] "France_Paris_Global_Conversion_Partner1"]]
        "Prospecting_2"]]
      {:default [:field 104665 {:base-type :type/Text}]}]},
    :breakout
    [[:field 104668 {:base-type :type/Text}]
     [:expression "Adset" {:base-type :type/Text}]
     [:field 104664 {:base-type :type/Text}]
     [:field 104666 {:base-type :type/Date, :temporal-unit :day}]
     [:expression "Campaign type" {:base-type :type/Text}]
     [:expression "Campaign country" {:base-type :type/Text}]],
    :aggregation
    [[:aggregation-options
      [:sum [:field 104667 {:base-type :type/Float}]]
      {:name "Spend", :display-name "Spend"}]
     [:sum [:field 104923 {:base-type :type/Number}]]
     [:sum [:field 104922 {:base-type :type/Number}]]
     [:avg [:field 108618 {:base-type :type/Float}]]
     [:sum [:field 110631 {:base-type :type/Float}]]
     [:sum [:field 110796 {:base-type :type/Float}]]
     [:sum [:field 110797 {:base-type :type/Float}]]
     [:sum [:field 110798 {:base-type :type/Float}]]]}})

(def ^:private ->database-type
  {:type/Text     "VARCHAR"
   :type/Boolean  "BOOLEAN"
   :type/Number   "NUMBER"
   :type/Float    "DOUBLE"
   :type/Date     "DATE"
   :type/DateTime "TIMESTAMPNTZ"})

(defn- gen-metadata [table-id essentials]
  (let [by-type   (atom {})
        type-name (fn [semantic-type effective-type]
                    (let [the-type (or semantic-type effective-type)]
                      (name the-type)))]
    (for [[index [id semantic-type effective-type has-field-values fk-target-field-id]] (m/indexed essentials)]
      (let [tname  (type-name semantic-type effective-type)
            counts (swap! by-type update tname (fnil inc 1))
            n      (get counts tname)
            parts  [tname "Field" n]]
        {;; Variable parts first
         :id                         id
         :name                       (u/upper-case-en (str/join "_" parts))
         :display-name               (str/join " " parts)
         :semantic-type              semantic-type
         :effective-type             effective-type
         :base-type                  effective-type
         :database-type              (->database-type effective-type)
         :position                   index
         :database-position          index
         :table-id                   table-id
         :fk-target-field-id         fk-target-field-id
         :has-field-values           has-field-values
                 ;; And now the fixed parts
         :lib/type                   :metadata/column
         :description                nil
         :database-partitioned       nil
         :target                     nil
         :database-is-auto-increment false
         :name-field                 nil
         :database-required          false
         :coercion-strategy          nil
         :settings                   nil
         :caveats                    nil
         :nfc-path                   nil
         :custom-position            0
         :active                     true
         :parent-id                  nil
         :points-of-interest         nil
         :visibility-type            :normal
         :database-indexed           nil
         :json-unfolding             false
         :preview-display            true}))))

(defn huge-query-metadata-provider
  "Returns a mock `MetadataProvider` with some wide tables and a card, borrowed from a real-world query contributed
 by a customer."
  []
  (mock/mock-metadata-provider
   {:database database
    :tables   tables
    :fields   (into [] cat [(gen-metadata 5237 field-essentials-5237)
                            (gen-metadata 4360 field-essentials-4360)
                            (gen-metadata 4263 field-essentials-4263)
                            (gen-metadata 5849 field-essentials-5849)])
    :cards    [{:id            15002
                :type          :question
                :database      179
                :name          "Spend per ad adset campaign"
                :dataset-query card-15002-query}]}))

(def ^:private legacy-huge-query
  {:type :query
   :database 179
   :query
   {:aggregation [[:aggregation-options
                   [:sum
                    [:field
                     "Spend"
                     {:base-type :type/Float,
                      :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN"}]]
                   {:name "Spend", :display-name "Spend"}]
                  [:aggregation-options
                   [:sum [:field "Apps" {:base-type :type/Float}]]
                   {:name "Apps", :display-name "Apps"}]
                  [:aggregation-options
                   [:sum [:field "QApps" {:base-type :type/Float}]]
                   {:name "QApps", :display-name "QApps"}]
                  [:aggregation-options
                   [:sum [:field "TI" {:base-type :type/Float}]]
                   {:name "TI", :display-name "TI"}]
                  [:aggregation-options
                   [:sum [:field "SA" {:base-type :type/Float}]]
                   {:name "SA", :display-name "SA"}]
                  [:aggregation-options
                   [:sum [:field "BST" {:base-type :type/Float}]]
                   {:name "BST", :display-name "BST"}]
                  [:aggregation-options
                   [:sum
                    [:field
                     "sum_2"
                     {:base-type :type/Number,
                      :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN"}]]
                   {:name "Clicks", :display-name "Clicks"}]
                  [:aggregation-options
                   [:sum
                    [:field
                     "sum"
                     {:base-type :type/Number,
                      :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN"}]]
                   {:name "Impressions", :display-name "Impressions"}]
                  [:aggregation-options
                   [:sum [:field "Tuition_with_VAT" {:base-type :type/Float}]]
                   {:name "Tuition with VAT", :display-name "Tuition with VAT"}]
                  [:aggregation-options
                   [:sum
                    [:field
                     "sum_3"
                     {:base-type :type/Float,
                      :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN"}]]
                   {:name "Watches", :display-name "Watches"}]
                  [:aggregation-options
                   [:sum [:field "SA High motivation" {:base-type :type/Float}]]
                   {:name "SA High motivation", :display-name "SA High motivation"}]
                  [:aggregation-options
                   [:sum [:field "SA Medium motivation" {:base-type :type/Float}]]
                   {:name "SA Medium motivation",
                    :display-name "SA Medium motivation"}]
                  [:aggregation-options
                   [:sum [:field "SA Low motivation" {:base-type :type/Float}]]
                   {:name "SA Low motivation", :display-name "SA Low motivation"}]
                  [:aggregation-options
                   [:sum
                    [:field
                     "sum_4"
                     {:base-type :type/Float,
                      :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN"}]]
                   {:name "P25_view", :display-name "P25_view"}]
                  [:aggregation-options
                   [:sum
                    [:field
                     "sum_5"
                     {:base-type :type/Float,
                      :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN"}]]
                   {:name "p50_view", :display-name "p50_view"}]
                  [:aggregation-options
                   [:sum
                    [:field
                     "sum_6"
                     {:base-type :type/Float,
                      :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN"}]]
                   {:name "p75_view", :display-name "p75_view"}]],
    :joins
    [{:condition
      [:and
       [:=
        [:field "UTM_CAMPAIGN" {:base-type :type/Text}]
        [:field 104668 {:base-type :type/Text,
                        :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN"}]]
       [:=
        [:field "UTM_CONTENT" {:base-type :type/Text}]
        [:field "Adset" {:base-type :type/Text,
                         :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN"}]]
       [:=
        [:field "AD_NAME" {:base-type :type/Text}]
        [:field 104664 {:base-type :type/Text,
                        :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN"}]]
       [:=
        [:field "APPLICATION_DATE" {:inherited-temporal-unit :day,
                                    :base-type :type/Date,
                                    :temporal-unit :day,
                                    :original-temporal-unit "day"}]
        [:field 104666 {:original-temporal-unit "day",
                        :base-type :type/Date,
                        :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN",
                        :temporal-unit :day,
                        :inherited-temporal-unit :day}]]],
      :alias "Spend per ad adset campaign - UTM_CAMPAIGN",
      :strategy :full-join,
      :ident "pGZ5SmA6sB-nam0DoxbEX",
      :source-table "card__15002"}],
    :expressions
    {"Campaign_"
     [:case
      [[[:is-empty [:field "UTM_CAMPAIGN" {:base-type :type/Text}]]
        [:field
         104668
         {:base-type :type/Text,
          :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN"}]]]
      {:default [:field "UTM_CAMPAIGN" {:base-type :type/Text}]}],
     "Adset_"
     [:case
      [[[:is-empty [:field "UTM_CONTENT" {:base-type :type/Text}]]
        [:field
         "Adset"
         {:base-type :type/Text,
          :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN"}]]]
      {:default [:field "UTM_CONTENT" {:base-type :type/Text}]}],
     "Ad_"
     [:case
      [[[:is-empty [:field "AD_NAME" {:base-type :type/Text}]]
        [:field
         104664
         {:base-type :type/Text,
          :join-alias "Spend per ad adset campaign - UTM_CAMPAIGN"}]]]
      {:default [:field "AD_NAME" {:base-type :type/Text}]}],
     "Date_"
     [:case
      [[[:is-empty
         [:field
          "APPLICATION_DATE"
          {:base-type :type/Date, :inherited-temporal-unit :day}]]
        [:field
         104666
         {:join-alias "Spend per ad adset campaign - UTM_CAMPAIGN",
          :base-type :type/Date,
          :inherited-temporal-unit :day}]]]
      {:default
       [:field
        "APPLICATION_DATE"
        {:base-type :type/Date, :inherited-temporal-unit :day}]}],
     "Campaign type_"
     [:case
      [[[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "Event"]
        "Events"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "Boost"]
        "Boosted Posts"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "Customer1"]
        "B2B - Customer1"]
       [[:contains
         [:lower [:expression "Campaign_" {:base-type :type/Text}]]
         "on24"]
        "Events"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "Customer2"]
        "Customer2"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "EmbeddedForms"]
        "Global - Embedded Forms"]
       [[:contains
         [:lower [:expression "Campaign_" {:base-type :type/Text}]]
         "Customer3"]
        "Events"]
       [[:contains
         [:lower [:expression "Campaign_" {:base-type :type/Text}]]
         "Customer4"]
        "Events"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "FP"]
        "FP"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "Webinars"]
        "Events"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "B2B"]
        "General B2B"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "_MKT"]
        "Global - New Courses"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "1Year"]
        "Global - 1Year Bootcamp"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "_ML_"]
        "Global - New Courses"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "DataScience"]
        "Global - New Courses"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "_AI_"]
        "Global - New Courses"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "_DV_"]
        "Global - New Courses"]
       [[:ends-with
         [:expression "Campaign_" {:base-type :type/Text}]
         "_ML"]
        "Global - New Courses"]
       [[:ends-with
         [:expression "Campaign_" {:base-type :type/Text}]
         "_AI"]
        "Global - New Courses"]
       [[:ends-with
         [:expression "Campaign_" {:base-type :type/Text}]
         "_DV"]
        "Global - New Courses"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "_DA_"]
        "Global - Legacy Courses"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "_UX_"]
        "Global - Legacy Courses"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "_CY_"]
        "Global - Legacy Courses"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "_WD_"]
        "Global - Legacy Courses"]
       [[:ends-with
         [:expression "Campaign_" {:base-type :type/Text}]
         "_DA"]
        "Global - Legacy Courses"]
       [[:ends-with
         [:expression "Campaign_" {:base-type :type/Text}]
         "_UX"]
        "Global - Legacy Courses"]
       [[:ends-with
         [:expression "Campaign_" {:base-type :type/Text}]
         "_CY"]
        "Global - Legacy Courses"]
       [[:ends-with
         [:expression "Campaign_" {:base-type :type/Text}]
         "_WD"]
        "Global - Legacy Courses"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "Global"]
        "Global"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "Local"]
        "Local"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "Influencer_AllCourses"]
        "Global"]]],
     "Campaign country_"
     [:case
      [[[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "Spain"]
        "Spain"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "France"]
        "France"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "Portugal"]
        "Portugal"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "Netherlands"]
        "Netherlands"]
       [[:contains
         [:expression "Campaign_" {:base-type :type/Text}]
         "Germany"]
        "Germany"]]]},
    :breakout
    [[:expression "Campaign_" {:base-type :type/Text}]
     [:expression "Adset_" {:base-type :type/Text}]
     [:expression "Ad_" {:base-type :type/Text}]
     [:expression "Date_" {:base-type :type/Date, :temporal-unit :day}]
     [:expression "Campaign type_" {:base-type :type/Text}]
     [:expression "Campaign country_" {:base-type :type/Text}]],
    :source-query
    {:expressions
     {"Country"
      [:case
       [[[:contains [:field 102701 {:base-type :type/Text}] "Spain"]
         "Spain"]
        [[:contains [:field 102701 {:base-type :type/Text}] "France"]
         "France"]
        [[:contains [:field 102701 {:base-type :type/Text}] "Portugal"]
         "Portugal"]
        [[:contains [:field 102701 {:base-type :type/Text}] "Germany"]
         "Germany"]
        [[:contains
          [:field 102701 {:base-type :type/Text}]
          "Netherlands"]
         "Netherlands"]]
       {:default "Other"}]},
     :breakout
     [[:field 102717 {:base-type :type/Text}]
      [:field 102737 {:base-type :type/Text}]
      [:field 102738 {:base-type :type/Text}]
      [:field 102733 {:base-type :type/Date, :temporal-unit :day}]],
     :aggregation
     [[:aggregation-options
       [:/ [:sum [:field 102735 {:base-type :type/Number}]] 100]
       {:name "Apps", :display-name "Apps"}]
      [:aggregation-options
       [:/
        [:sum
         [:case
          [[[:= [:field 102703 {:base-type :type/Number}] 1]
            [:field 102735 {:base-type :type/Number}]]]]]
        100]
       {:name "QApps", :display-name "QApps"}]
      [:aggregation-options
       [:/
        [:sum
         [:case
          [[[:>= [:field 103239 {:base-type :type/Number,
                                 :join-alias "DAILY_APPLICANT_SEGMENT - FK_PARTNER123_ACCOUNT_ID"}]
             3]
            [:field 102735 {:base-type :type/Number}]]]]]
        100]
       {:name "TI", :display-name "TI"}]
      [:aggregation-options
       [:/
        [:sum
         [:case
          [[[:contains
             [:field 99847 {:base-type :type/Text,
                            :join-alias "DAILY_APPLICANT_SEGMENT - FK_PARTNER123_ACCOUNT_ID"}]
             "Student"]
            [:field 102735 {:base-type :type/Number}]]]]]
        100]
       {:name "SA", :display-name "SA"}]
      [:aggregation-options
       [:/
        [:sum
         [:case
          [[[:= [:field 102715 {:base-type :type/Number}] 1]
            [:field 102735 {:base-type :type/Number}]]]]]
        100]
       {:name "BST", :display-name "BST"}]
      [:aggregation-options
       [:sum
        [:case
         [[[:= [:field 102715 {:base-type :type/Number}] 1]
           [:field 85728 {:base-type  :type/Float,
                          :join-alias "DAILY_PARTNER123_OPPORTUNITY - FK_PARTNER123_OPPORTUNITY_ID"}]]]]]
       {:name "Tuition_with_VAT", :display-name "Tuition_with_VAT"}]
      [:aggregation-options
       [:/
        [:sum
         [:case
          [[[:and
             [:contains
              [:field 99847 {:base-type  :type/Text,
                             :join-alias "DAILY_APPLICANT_SEGMENT - FK_PARTNER123_ACCOUNT_ID"}]
              "Student"]
             [:= [:field 110700 {:base-type :type/Text}] "High"]]
            [:field 102735 {:base-type :type/Number}]]]]]
        100]
       {:name "SA High motivation", :display-name "SA High motivation"}]
      [:aggregation-options
       [:/
        [:sum
         [:case
          [[[:and
             [:contains
              [:field 99847 {:base-type :type/Text,
                             :join-alias "DAILY_APPLICANT_SEGMENT - FK_PARTNER123_ACCOUNT_ID"}]
              "Student"]
             [:= [:field 110700 {:base-type :type/Text}] "Medium"]]
            [:field 102735 {:base-type :type/Number}]]]]]
        100]
       {:name "SA Medium motivation",
        :display-name "SA Medium motivation"}]
      [:aggregation-options
       [:/
        [:sum
         [:case
          [[[:and
             [:contains
              [:field 99847 {:base-type :type/Text,
                             :join-alias "DAILY_APPLICANT_SEGMENT - FK_PARTNER123_ACCOUNT_ID"}]
              "Student"]
             [:= [:field 110700 {:base-type :type/Text}] "Low"]]
            [:field 102735 {:base-type :type/Number}]]]]]
        100]
       {:name "SA Low motivation", :display-name "SA Low motivation"}]],
     :joins
     [{:condition
       [:and
        [:=
         [:field 102729 {:base-type :type/Text}]
         [:field 82711 {:base-type :type/Text,
                        :join-alias "DAILY_APPLICANT_SEGMENT - FK_PARTNER123_ACCOUNT_ID"}]]
        [:=
         [:field 102700 {:base-type :type/Text}]
         [:field 82702 {:base-type :type/Text,
                        :join-alias "DAILY_APPLICANT_SEGMENT - FK_PARTNER123_ACCOUNT_ID"}]]],
       :fields :all,
       :alias "DAILY_APPLICANT_SEGMENT - FK_PARTNER123_ACCOUNT_ID",
       :strategy :left-join,
       :ident "_2AjE07KtvjC58QDep5DU",
       :source-table 4360}
      {:condition
       [:=
        [:field 102700 {:base-type :type/Text}]
        [:field 85585 {:base-type :type/Text,
                       :join-alias "DAILY_PARTNER123_OPPORTUNITY - FK_PARTNER123_OPPORTUNITY_ID"}]],
       :ident "_3a-z8iM88N2vDlw8PdPQ",
       :strategy :left-join,
       :alias "DAILY_PARTNER123_OPPORTUNITY - FK_PARTNER123_OPPORTUNITY_ID",
       :source-table 4263}],
     :source-table 5237,
     :filter
     [:and
      [:= [:field 102723 {:base-type :type/Text}] "Paid Social"]
      [:= [:field 102735 {:base-type :type/Number}] 100]]}}})

(defn huge-query
  "Returns a [[lib/query]] for a large, complex query against the [[huge-query-metadata-provider]], based on a
 real-world query contributed by a customer.

 Useful for performance testing, since it has several complex expressions, especially large `:case` statements.
 See [[metabase.test.query-processor/perf-test]] for some usages."
  []
  (lib/query (huge-query-metadata-provider) legacy-huge-query))
