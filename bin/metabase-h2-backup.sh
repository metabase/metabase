#!/bin/bash
  
### Variables setup

# Java JRE path
JAVAP="/usr/bin/java"

# Metabase home directory
MDIR="/var/www/metabase/"

# Backup file compression options
BFC="/bin/tar -cJf"

# Backup file upload options (sorry for BFU labeled variable :-D)
BFU="/usr/bin/rsync -t --remove-source-files --progress "

# Backup file upload host or username@host
BFUH="backup-server"

# Backup file upload path
BFUP="/volume1/MetabaseBackup/"

# Metabase PID file location
PIDF=$MDIR"metabase.pid"

# Metabase JAR file location
MJAR=$MDIR"metabase.jar"

# Metabase BACKUP file location
BCKF=$MDIR"metabase.db."`date +%F_%H%M%S`".bkp"

# Metabase BACKUP file size lower limit in bytes (this file must be bigger then this value)
BCKL=100000

# Metabase COMPRESSED BACKUP file location
BCKC=$BCKF".tar.xz"

# Metabase COMPRESSED BACKUP file size lower limit in bytes (this file must be bigger then this value)
BCKCL=100000



### Backup ROUTINE ###

# 1. Stop Metabase service
echo `date`" - Metabase service stop - BEGIN"
service metabase stop
echo `date`" - Metabase service stop - END"

# Wait a little ...
sleep 10

# 2. Check if Metabase has stopped
MPS=`ps -ef | grep -v grep | grep \`cat $PIDF\` | wc -l`

if [ -z $MPS ]; then
        MPS=0
fi

# If Metabase has not stopped, try it again with force
if [ $MPS -gt 0 ]; then
        echo `date`" - Metabase instance running found ($MPS) - trying to kill it"
        kill -9 `cat $PIDF`
else
        echo `date`" - Metabase has stopped OK - no running instance found"
fi

# 3. Make Metabase DB backup
echo `date`" - Metabase DB backup - START"
$JAVAP -cp $MJAR org.h2.tools.Script -url jdbc:h2:`pwd`/metabase.db -script $BCKF
echo `date`" - Metabase DB backup - END"

# 4. Start Metabase service again to have as short offline time as possible
echo `date`" - Metabase service start - BEGIN"
service metabase start
echo `date`" - Metabase service start - END"

# 4. Check if backup file exists and it is bigger then limit
BKPS=`stat -c %s $BCKF 2> /dev/null`

if [ -z $BKPS ]; then
        BKPS=0
fi

# WHen file is too small - end with error
if [ $BKPS -lt $BCKL ]; then
        echo `date`" - Metabase DB backup file is TOO SMALL - ERROR = END ..."
        exit 1
# Else file is OK, lets compress it and remove original exported file
else
        echo `date`" - Metabase DB backup file compression - BEGIN"
        $BFC $BCKC $BCKF && rm $BCKF
        echo `date`" - Metabase DB backup file compression - END"
fi

# 5. Upload compressed backup file to backup-server when it is bigger then limit
BKPS=`stat -c %s $BCKC 2> /dev/null`

if [ -z $BKPS ]; then
        BKPS=0
fi

# WHen file is too small - end with error
if [ $BKPS -lt $BCKCL ]; then
        echo `date`" - Metabase DB compressed backup file is TOO SMALL - ERROR = END ..."
        exit 1
# Else file is OK, lets upload it
else
        echo `date`" - Metabase DB compressed backup file upload - BEGIN"
        $BFU $BCKC $BFUH:$BFUP
        echo `date`" - Metabase DB compressed backup file upload - END"
fi

echo `date`" - Metabase DB backup completed ..."
echo 
echo 

exit 0
