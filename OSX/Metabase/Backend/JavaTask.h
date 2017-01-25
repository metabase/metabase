//
//  JavaTask.h
//  Metabase
//
//  Created by Cam Saul on 11/24/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

NSString *JREPath();
NSString *UberjarPath();
NSString *DBPath();			///< Path to the H2 DB file
NSString *PluginsDirPath(); ///< Path for plugins

/// Base class for running JRE-based NSTasks
@interface JavaTask : NSObject

@property (strong, nonatomic) NSTask *task;

/// Called when a new data is written to the task's stdin / stdout. Default implementation does nothing. This is called on a background thread!
- (void)readHandleDidRead:(NSString *)message;

/// Terminate the associated NSTask.
- (void)terminate;


@end
