//
//  MetabaseTask.m
//  Metabase
//
//  Created by Cam Saul on 10/9/15.
//  Copyright (c) 2015 Metabase. All rights reserved.
//

#import "MetabaseTask.h"

#define ENABLE_JAR_UNPACKING 0

@interface MetabaseTask ()
@property (strong, nonatomic) NSTask *task;
@property (strong, nonatomic) NSPipe *pipe;
@property (strong, nonatomic) NSFileHandle *readHandle;

@property (strong, readonly) NSString *javaPath;
@property (strong, readonly) NSString *jarPath;
@property (strong, readonly) NSString *dbPath;

#if ENABLE_JAR_UNPACKING
	@property (strong, readonly) NSString *unpack200Path;
#endif

@property (nonatomic) NSUInteger port;
@end

@implementation MetabaseTask

+ (MetabaseTask *)task {
	return [[MetabaseTask alloc] init];
}


#pragma mark - Lifecycle

- (instancetype)init {
	if (self = [super init]) {
		[[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(fileHandleCompletedRead:) name:NSFileHandleReadCompletionNotification object:nil];
	}
	return self;
}

- (void)dealloc {
	[[NSNotificationCenter defaultCenter] removeObserver:self];
	[self terminate];
}


#pragma mark - Notifications

- (void)fileHandleCompletedRead:(NSNotification *)notification {
	if (!self.readHandle) return;
	
	__weak MetabaseTask *weakSelf = self;
	dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_BACKGROUND, 0), ^{
		if (!weakSelf) return;
		@try {
			NSString *message = [[NSString alloc] initWithData:weakSelf.readHandle.availableData encoding:NSUTF8StringEncoding];
			// skip calls to health endpoint
			if ([message rangeOfString:@"GET /api/health"].location == NSNotFound) {
				// strip off the timestamp that comes back from the backend so we don't get double-timestamps when NSLog adds its own
				NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"^[\\d-:,\\s]+(.*$)" options:NSRegularExpressionAnchorsMatchLines|NSRegularExpressionAllowCommentsAndWhitespace error:nil];
				message = [regex stringByReplacingMatchesInString:message options:0 range:NSMakeRange(0, message.length) withTemplate:@"$1"];
				
				// remove control codes used to color output
				regex = [NSRegularExpression regularExpressionWithPattern:@"\\[\\d+m" options:0 error:nil];
				message = [regex stringByReplacingMatchesInString:message options:0 range:NSMakeRange(0, message.length) withTemplate:@""];
				
				NSLog(@"%@", message);
			}
		} @catch (NSException *) {}
		
		dispatch_async(dispatch_get_main_queue(), ^{
			[weakSelf.readHandle readInBackgroundAndNotify];
		});
	});
}


#pragma mark - Local Methods

#if ENABLE_JAR_UNPACKING
/// unpack the jars in the BG if needed the first time around
- (void)unpackJars {
	[self.packedJarPaths enumerateObjectsWithOptions:NSEnumerationConcurrent usingBlock:^(NSString *packedFilename, NSUInteger idx, BOOL *stop) {
		NSString *jarName = [packedFilename stringByReplacingOccurrencesOfString:@".pack.gz" withString:@".jar"];
		
		if (![[NSFileManager defaultManager] fileExistsAtPath:jarName]) {
			NSLog(@"Unpacking %@ ->\n\t%@...", packedFilename, jarName);
			NSTask *task = [[NSTask alloc] init];
			task.launchPath = self.unpack200Path;
			task.arguments = @[packedFilename, jarName];
			[task launch];
			[task waitUntilExit];
		}
	}];
}
#endif

- (void)deleteOldDBLockFilesIfNeeded {
	NSString *lockFile	= [self.dbPath stringByAppendingString:@".lock.db"];
	NSString *traceFile = [self.dbPath stringByAppendingString:@".trace.db"];
	
	for (NSString *file in @[lockFile, traceFile]) {
		if ([[NSFileManager defaultManager] fileExistsAtPath:file]) {
			NSLog(@"Deleting %@...", file);
			
			NSError *error = nil;
			[[NSFileManager defaultManager] removeItemAtPath:file error:&error];
			
			if (error) {
				NSLog(@"Error deleting %@: %@", file, error.localizedDescription);
			}
		}
	}
}

- (void)launch {
	dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0), ^{
		
		#if ENABLE_JAR_UNPACKING
			[self unpackJars];
		#endif
		
		[self deleteOldDBLockFilesIfNeeded];
				
		NSLog(@"Starting MetabaseTask @ 0x%zx...", (size_t)self);
		
		self.task					= [[NSTask alloc] init];
		self.task.launchPath		= self.javaPath;
		self.task.environment		= @{@"MB_DB_FILE": self.dbPath,
										@"MB_JETTY_PORT": @(self.port)};
		self.task.arguments			= @[@"-jar", self.jarPath];
		
		self.pipe					= [NSPipe pipe];
		self.task.standardOutput	= self.pipe;
		self.task.standardError		= self.pipe;
		
		__weak MetabaseTask *weakSelf = self;
		self.task.terminationHandler = ^(NSTask *task){
			NSLog(@"\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Task terminated with exit code %d !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!", task.terminationStatus);
			dispatch_async(dispatch_get_main_queue(), ^{
				if ([[NSAlert alertWithMessageText:@"Fatal Error" defaultButton:@"Restart" alternateButton:@"Quit" otherButton:nil informativeTextWithFormat:@"The Metabase server terminated unexpectedly."] runModal] == NSAlertDefaultReturn) {
					[weakSelf launch];
				} else {
					exit(task.terminationStatus);
				}
			});
		};
				
		self.readHandle = self.pipe.fileHandleForReading;
		dispatch_async(dispatch_get_main_queue(), ^{
			[self.readHandle readInBackgroundAndNotify];
		});
						
		NSLog(@"%@ -jar %@", self.javaPath, self.jarPath);
		[self.task launch];
	});
}

- (void)terminate {
	if (!self.task) return; // already dead

	NSLog(@"Killing MetabaseTask @ 0x%zx...", (size_t)self);
	self.task = nil;
	_port = 0;
}


#pragma mark - Getters / Setters

- (void)setTask:(NSTask *)task {
	self.pipe = nil;
	[_task terminate];
	_task = task;
}

- (void)setPipe:(NSPipe *)pipe {
	self.readHandle = nil;
	_pipe = pipe;
}

- (void)setReadHandle:(NSFileHandle *)readHandle {
	[_readHandle closeFile];
	_readHandle = readHandle;
}

- (NSString *)javaPath {
	return [[NSBundle mainBundle] pathForResource:@"java" ofType:nil inDirectory:@"jre/bin"];
}

- (NSString *)jarPath {
	return [[NSBundle mainBundle] pathForResource:@"metabase" ofType:@"jar"];
}

- (NSString *)dbPath {
	NSString *applicationSupportDir = [NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES)[0] stringByAppendingPathComponent:@"Metabase"];
	if (![[NSFileManager defaultManager] fileExistsAtPath:applicationSupportDir]) {
		NSError *error = nil;
		[[NSFileManager defaultManager] createDirectoryAtPath:applicationSupportDir withIntermediateDirectories:YES attributes:nil error:&error];
		if (error) {
			NSLog(@"Error creating %@: %@", applicationSupportDir, error.localizedDescription);
		}
	}
	return [applicationSupportDir stringByAppendingPathComponent:@"metabase.db"];
}

- (NSUInteger)port {
	if (!_port) {
		srand((unsigned)time(NULL));
		_port = (rand() % 1000) + 13000;
		NSLog(@"Using port %lu", _port);
	}
	return _port;
}

#if ENABLE_JAR_UNPACKING
- (NSArray *)packedJarPaths {
	return [[NSBundle mainBundle] pathsForResourcesOfType:@"pack.gz" inDirectory:@"jre/lib"];
}

- (NSString *)unpack200Path {
	return [[NSBundle mainBundle] pathForResource:@"unpack200" ofType:nil inDirectory:@"jre/bin"];
}
#endif

@end
