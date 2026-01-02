import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import RemediesBackendService from '../../services/shopify/remediesBackend.service';

const COLORS = {
  PRIMARY: '#372643',
  ACCENT: '#FFC107',
  BG: '#F5F5F7',
  CARD: '#FFFFFF',
  TEXT_PRIMARY: '#1A1A1A',
  TEXT_SECONDARY: '#6B7280',
  BORDER: '#E5E7EB',
  SUCCESS: '#10B981',
  WARNING: '#F59E0B',
  INFO: '#3B82F6',
};

const AstrologerSuggestedRemediesScreen = ({ navigation, route }) => {
  const { orderId, userName } = route.params;

  const [remedies, setRemedies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRemedies();
  }, []);

  const loadRemedies = async () => {
    try {
      setLoading(true);
      const response = await RemediesBackendService.getAstrologerOrderRemedies(orderId);
      if (response?.success) {
        setRemedies(response.data.remedies || []);
      }
    } catch (error) {
      console.error('Error loading remedies:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderRemedy = ({ item }) => {
    const isProduct = item.remedySource === 'shopify_product';
    const product = item.shopifyProduct;

    return (
      <View style={styles.card}>
        {/* Header: Type & Status */}
        <View style={styles.cardHeader}>
          <View style={styles.typeTag}>
            <Icon 
              name={isProduct ? 'shopping' : 'text-box-outline'} 
              size={14} 
              color={COLORS.PRIMARY}
            />
            <Text style={styles.typeText}>
              {isProduct ? 'Product' : 'Manual'}
            </Text>
          </View>
          <View style={[
            styles.statusTag, 
            item.isPurchased ? styles.statusPurchased : styles.statusSuggested
          ]}>
            <Icon 
              name={item.isPurchased ? 'check-circle' : 'clock-outline'} 
              size={12} 
              color="#FFF" 
              style={{ marginRight: 4 }}
            />
            <Text style={styles.statusText}>
              {item.isPurchased ? 'Purchased' : 'Suggested'}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          {isProduct && product ? (
            <View style={styles.imageContainer}>
              <Image
                source={product.imageUrl ? { uri: product.imageUrl } : require('../../assets/onlyLogoVaidik.png')}
                style={styles.productImage}
                resizeMode="cover"
              />
            </View>
          ) : null}

          <View style={styles.contentCol}>
            <Text style={styles.title} numberOfLines={2}>
              {isProduct ? product?.productName : item.title}
            </Text>
            
            {isProduct && (
              <View style={styles.priceRow}>
                <Icon name="currency-inr" size={16} color={COLORS.PRIMARY} />
                <Text style={styles.price}>{product?.price}</Text>
              </View>
            )}

            <View style={styles.reasonSection}>
              <View style={styles.labelRow}>
                <Icon name="lightbulb-on-outline" size={14} color={COLORS.ACCENT} />
                <Text style={styles.label}>Recommendation Reason</Text>
              </View>
              <Text style={styles.description} numberOfLines={3}>
                {item.recommendationReason}
              </Text>
            </View>

            {item.usageInstructions && (
              <View style={styles.instructionsSection}>
                <View style={styles.labelRow}>
                  <Icon name="information-outline" size={14} color={COLORS.INFO} />
                  <Text style={styles.label}>Usage Instructions</Text>
                </View>
                <Text style={styles.description} numberOfLines={2}>
                  {item.usageInstructions}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Footer: Dates */}
        <View style={styles.cardFooter}>
          <View style={styles.dateRow}>
            <Icon name="calendar-clock" size={12} color={COLORS.TEXT_SECONDARY} />
            <Text style={styles.dateText}>
              Suggested {new Date(item.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              })}
            </Text>
          </View>
          {item.isPurchased && (
            <View style={styles.dateRow}>
              <Icon name="check-circle" size={12} color={COLORS.SUCCESS} />
              <Text style={[styles.dateText, { color: COLORS.SUCCESS }]}>
                Purchased {new Date(item.purchaseDetails.purchasedAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short'
                })}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient colors={[COLORS.PRIMARY, '#4A3456']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Suggested Remedies</Text>
          <Text style={styles.headerSubtitle}>
            Order #{orderId.slice(-6)} • {userName}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.PRIMARY} />
          <Text style={styles.loaderText}>Loading remedies...</Text>
        </View>
      ) : (
        <FlatList
          data={remedies}
          keyExtractor={(item) => item.remedyId}
          renderItem={renderRemedy}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="package-variant-closed" size={80} color={COLORS.BORDER} />
              <Text style={styles.emptyText}>No remedies suggested yet</Text>
              <Text style={styles.emptySubtext}>
                Suggested remedies will appear here
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.BG },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, marginLeft: 12 },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: '#FFF',
    letterSpacing: 0.3,
  },
  headerSubtitle: { 
    fontSize: 13, 
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  
  listContent: { 
    padding: 16,
    paddingBottom: 32,
  },
  
  loader: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '500',
  },

  card: {
    backgroundColor: COLORS.CARD,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: COLORS.BG,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  
  typeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.ACCENT,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  typeText: { 
    fontSize: 12, 
    fontWeight: '700', 
    color: COLORS.PRIMARY,
  },
  
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusSuggested: { backgroundColor: COLORS.WARNING },
  statusPurchased: { backgroundColor: COLORS.SUCCESS },
  statusText: { 
    fontSize: 11, 
    fontWeight: '700', 
    color: '#FFF',
  },

  cardBody: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'flex-start',
  },
  
  imageContainer: {
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.BG,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: COLORS.BG,
  },
  
  contentCol: { 
  flex: 1,
  justifyContent: 'flex-start',  // ✅ Added
},
  
  title: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 8,
    lineHeight: 22,
  },
  
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  price: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: COLORS.PRIMARY,
    marginLeft: 2,
  },
  
  reasonSection: {
    marginBottom: 12,
  },
  instructionsSection: {
    marginTop: 8,
  },
  
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  label: { 
    fontSize: 12, 
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  description: { 
    fontSize: 14, 
    color: COLORS.TEXT_PRIMARY,
    lineHeight: 20,
  },

  cardFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.BG,
  },
  
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: { 
    fontSize: 11, 
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '500',
  },

  emptyContainer: { 
    alignItems: 'center', 
    paddingVertical: 100,
    paddingHorizontal: 24,
  },
  emptyText: { 
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 6,
    textAlign: 'center',
  },
});

export default AstrologerSuggestedRemediesScreen;
