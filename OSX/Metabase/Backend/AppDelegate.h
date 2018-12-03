//
//  AppDelegate.h
//  Metabase
//
//  Created by Cam Saul on 9/21/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

@import Cocoa;

@interface AppDelegate : NSObject <NSApplicationDelegate>

+ (AppDelegate *)instance;

@property (readonly) NSUInteger port;

- (void)stopMetabaseTask;
- (void)startMetabaseTask;

@end
