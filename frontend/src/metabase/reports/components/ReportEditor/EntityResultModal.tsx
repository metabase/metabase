import React, { useEffect } from "react";
import { Modal, Box, Text, Button, Group } from "metabase/ui";
import { Icon } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import type { ReportEntity, ReportEntityResult } from "../../store/reportSlice";

interface EntityResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: ReportEntity | null;
  result: ReportEntityResult | null;
}

export const EntityResultModal = ({
  isOpen,
  onClose,
  entity,
  result
}: EntityResultModalProps) => {
  // Debug logging
  console.log('EntityResultModal render:', { entity, result, isOpen });

  useEffect(() => {
    if (result?.data && Array.isArray(result.data) && result.data.length > 0) {
      console.log('EntityResultModal rawSeries:', result.data);
      console.log('EntityResultModal first series:', result.data[0]);
      console.log('EntityResultModal data structure:', {
        hasData: !!result.data[0]?.data,
        hasRows: !!result.data[0]?.data?.rows,
        hasCols: !!result.data[0]?.data?.cols,
        rowCount: result.data[0]?.data?.rows?.length,
        colCount: result.data[0]?.data?.cols?.length,
        cardDisplay: result.data[0]?.card?.display,
        cardName: result.data[0]?.card?.name
      });
    }
  }, [result]);

  if (!entity) return null;

  const getEntityTypeDisplay = (model: string) => {
    switch (model) {
      case 'table': return 'Table';
      case 'card': return 'Question';
      case 'dashboard': return 'Dashboard';
      default: return model;
    }
  };

  const getEntityIcon = (model: string) => {
    switch (model) {
      case 'table': return 'table';
      case 'card': return 'insight';
      case 'dashboard': return 'dashboard';
      default: return 'info';
    }
  };

  console.log(result);

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="95%"
      styles={{
        content: {
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflow: 'auto'
        },
        body: {
          height: '100%'
        }
      }}
      title={
        <Group gap="sm">
          <Icon
            name={getEntityIcon(entity.model)}
            size={20}
          />
          <Box>
            <Text size="lg" fw={600}>
              {entity.name}
            </Text>
            <Text size="sm" color="dimmed">
              {getEntityTypeDisplay(entity.model)} • ID: {entity.id}
            </Text>
          </Box>
        </Group>
      }
    >
      <Box style={{ minHeight: '400px' }}>
        {result?.error && (
          <Box
            style={{
              padding: '24px',
              border: '2px solid #ea4335',
              borderRadius: '8px',
              backgroundColor: '#fef7f0',
              textAlign: 'center'
            }}
          >
            <Icon name="warning" size={24} style={{ color: '#ea4335', marginBottom: '8px' }} />
            <Text size="sm" color="red" fw={500} style={{ marginBottom: '8px' }}>
              Failed to load visualization
            </Text>
            <Text size="xs" color="dimmed">
              {result.error}
            </Text>
          </Box>
        )}

                {result?.data && Array.isArray(result.data) && result.data.length > 0 && (
          <Box>
            <Box style={{ marginBottom: '16px' }}>
              <Group style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Text size="sm" color="dimmed">
                  {result.lastRun && `Last updated: ${new Date(result.lastRun).toLocaleString()}`}
                </Text>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={onClose}
                >
                  <Icon name="close" size={12} style={{ marginRight: '4px' }} />
                  Close
                </Button>
              </Group>
            </Box>

                        <Text size="xs" color="dimmed" style={{ marginBottom: '8px' }}>
              Debug: Series length: {result.data.length},
              First series keys: {result.data[0] ? Object.keys(result.data[0]).join(', ') : 'none'},
              Has data: {result.data[0]?.data ? 'yes' : 'no'},
              Rows: {result.data[0]?.data?.rows?.length || 0},
              Cols: {result.data[0]?.data?.cols?.length || 0}
            </Text>

            <Box
              style={{
                border: '2px solid #34a853',
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: '#ffffff',
                height: '600px',
                width: '100%',
                overflow: 'auto'
              }}
            >
              <EmotionCacheProvider>
                <Box style={{ height: '100%', width: '100%' }}>
                  <Visualization
                    rawSeries={result.data.map(series => ({
                      ...series,
                      card: {
                        ...series.card,
                        display: "table"
                      }
                    }))}
                    isDashboard={false}
                    width={null}
                    height={null}
                    showTitle={false}
                    handleVisualizationClick={() => {}}
                    style={{ height: '100%', width: '100%' }}
                  />
                </Box>
              </EmotionCacheProvider>
            </Box>
          </Box>
        )}

        {!result?.error && !result?.data && (
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '300px',
              flexDirection: 'column',
              gap: '16px',
              border: '2px dashed #e0e0e0',
              borderRadius: '8px',
              backgroundColor: '#f8f9fa'
            }}
          >
            <Icon name="info" size={24} style={{ color: '#666' }} />
            <Text color="dimmed" style={{ textAlign: 'center' }}>
              No data available for this entity.<br />
              Run the report to see results.
            </Text>
          </Box>
        )}
      </Box>
    </Modal>
  );
};
