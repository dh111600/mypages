var app = angular.module('bookmarkApp', []);

// 更新为 Worker 代理配置
const WORKER_URL = 'https://base.111600.xyz';
const supabaseClient = supabase.createClient(WORKER_URL, 'dummy-key', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    flowType: 'pkce',
    redirectTo: 'https://my.111600.xyz'  // 确保与前端域名一致
  },
  global: {
    headers: {
      'X-Custom-Origin': window.location.hostname
    }
  }
})

// 统一服务定义
app.factory('AuthService', () => ({
  login: (email, password) => supabaseClient.auth.signInWithPassword({ email, password }),
  logout: () => supabaseClient.auth.signOut(),
  getUser: () => supabaseClient.auth.getUser()
}));

app.factory('BookmarkService', () => ({
  getBookmarks: (userId) => supabaseClient.from('bookmarks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false }),
  addBookmark: (userId, title, url) => supabaseClient.from('bookmarks')
    .insert([{ user_id: userId, title, url }])
    .select(),
  updateBookmark: (bookmarkId, title, url) => supabaseClient.from('bookmarks')
    .update({ title, url })
    .eq('id', bookmarkId)
    .select(),
  deleteBookmark: (bookmarkId) => supabaseClient.from('bookmarks')
    .delete()
    .eq('id', bookmarkId)
}));

// 唯一控制器定义
app.controller('AuthController', [
  '$scope',
  'AuthService',
  'BookmarkService',
  ($scope, AuthService, BookmarkService) => {
    // 初始化状态
    $scope.sessionChecked = false;
    $scope.isLoggedIn = false;
    $scope.bookmarks = [];
    $scope.username = localStorage.getItem('rememberedEmail') || ''; // 读取存储的邮箱
    $scope.currentUser = null;
    $scope.newBookmark = { title: '', url: '' };
    $scope.bookmarkMessage = '';

    $scope.publicServices = [];
    $scope.serviceMessage = '';
    $scope.newService = { title: '', url: '', desc: '' };

    const PUBLIC_SERVICES_KEY = 'publicServices';

    $scope.initPublicServices = function() {
      const stored = localStorage.getItem(PUBLIC_SERVICES_KEY);
      if (stored) {
        try {
          $scope.publicServices = JSON.parse(stored);
        } catch (e) {
          $scope.publicServices = [];
        }
      }
      if (!$scope.publicServices || $scope.publicServices.length === 0) {
        $scope.publicServices = [
          { title: '服务器探针', desc: '实时监控服务器状态与性能指标', url: 'https://vps.111600.xyz/' },
          { title: '技术社区', desc: 'NodeSeek 交流论坛', url: 'https://www.nodeseek.com/' },
          { title: '搬瓦工控制台', desc: '服务器管理', url: 'https://bwh81.net/clientarea.php' },
          { title: 'Massive Grid', desc: 'UK VPS', url: 'https://portal.massivegrid.com/clientarea.php' },
          { title: 'RackNerd 客户区域', desc: '登录账户', url: 'https://my.racknerd.com/index.php?rp=/login' }
        ];
        localStorage.setItem(PUBLIC_SERVICES_KEY, JSON.stringify($scope.publicServices));
      }

      // 初始化后如果是同步更新, 手动应用
      if (!$scope.$$phase) $scope.$apply();
    };

    const normalizeUrl = function(url) {
      if (!url) return '';
      const trimmed = url.trim();
      return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    };

    function savePublicServices() {
      localStorage.setItem(PUBLIC_SERVICES_KEY, JSON.stringify($scope.publicServices));
    }

    $scope.addPublicService = function(event) {
      if (!$scope.isLoggedIn) {
        $scope.serviceMessage = '请先登录后进行修改';
        return;
      }
      if (event) event.preventDefault();
      const title = ($scope.newService.title || '').trim();
      const url = normalizeUrl($scope.newService.url);
      const desc = ($scope.newService.desc || '').trim();
      if (!title || !url) {
        $scope.serviceMessage = '请填写服务名称和有效链接';
        return;
      }
      $scope.publicServices.unshift({ title, url, desc });
      savePublicServices();
      $scope.newService = { title: '', url: '', desc: '' };
      $scope.serviceMessage = '公共服务导航已添加';
    };

    $scope.startEditPublicService = function(service) {
      if (!$scope.isLoggedIn) {
        $scope.serviceMessage = '请先登录后进行修改';
        return;
      }
      service.editing = true;
      service.editTitle = service.title;
      service.editUrl = service.url;
      service.editDesc = service.desc;
      $scope.serviceMessage = '';
    };

    $scope.cancelEditPublicService = function(service) {
      if (!$scope.isLoggedIn) {
        $scope.serviceMessage = '请先登录后进行修改';
        return;
      }
      service.editing = false;
      service.editTitle = undefined;
      service.editUrl = undefined;
      service.editDesc = undefined;
      $scope.serviceMessage = '';
    };

    $scope.updatePublicService = function(service) {
      if (!$scope.isLoggedIn) {
        $scope.serviceMessage = '请先登录后进行修改';
        return;
      }
      if (!service) return;
      const title = (service.editTitle || '').trim();
      const url = normalizeUrl(service.editUrl);
      const desc = (service.editDesc || '').trim();
      if (!title || !url) {
        $scope.serviceMessage = '请填写服务名称和有效链接';
        return;
      }
      service.title = title;
      service.url = url;
      service.desc = desc;
      service.editing = false;
      savePublicServices();
      $scope.serviceMessage = '公共服务导航已更新';
    };

    $scope.deletePublicService = function(service) {
      if (!$scope.isLoggedIn) {
        $scope.serviceMessage = '请先登录后进行修改';
        return;
      }
      if (!service) return;
      if (!window.confirm('确定要删除该公共服务吗？')) return;
      $scope.publicServices = $scope.publicServices.filter(item => item !== service);
      savePublicServices();
      $scope.serviceMessage = '已删除公共服务';
    };

    $scope.resetPublicServices = function() {
      if (!$scope.isLoggedIn) {
        $scope.serviceMessage = '请先登录后进行修改';
        return;
      }
      localStorage.removeItem(PUBLIC_SERVICES_KEY);
      $scope.initPublicServices();
      $scope.serviceMessage = '公共服务导航已恢复默认';
    };

    // 检查会话状态
    async function checkSession() {
      try {
        const { data: { user }, error } = await AuthService.getUser();
        if (error) {
          throw new Error(error.message || '会话检查失败');
        }
        if (user) {
          $scope.isLoggedIn = true;
          $scope.currentUser = user;
          const { data: bookmarks, error: bookmarkError } = await BookmarkService.getBookmarks(user.id);
          if (bookmarkError) throw new Error(bookmarkError.message || '书签加载失败');
          $scope.bookmarks = bookmarks || [];
        } else {
          $scope.isLoggedIn = false;
          $scope.bookmarks = [];
          $scope.currentUser = null;
        }
      } catch (error) {
        // 记录错误以便调试，生产环境可集成 Sentry 等日志服务
        if (error && typeof error === 'object') {
          console.debug('Session check error:', error.message || error);
        }
      } finally {
        $scope.sessionChecked = true;
        $scope.$apply();
      }
    }

    // 页面加载时检查会话
    checkSession();
    
    // 初始化时清除错误消息
    $scope.message = '';

    // 退出登录方法
    $scope.logout = async function() {
      try {
        await AuthService.logout();
        $scope.$apply(() => {
          $scope.isLoggedIn = false;
          $scope.bookmarks = [];
          $scope.message = '';
        });
      } catch (error) {
        // 即使登出失败也清除本地状态
        $scope.$apply(() => {
          $scope.isLoggedIn = false;
          $scope.bookmarks = [];
          console.debug('Logout error (local state cleared):', error?.message);
        });
      }
    };

    // 登录方法
    $scope.login = async function(event) {
      if (event) event.preventDefault();
      if (!$scope.username || !$scope.password) {
        return $scope.message = '请输入邮箱和密码';
      }
      try {
        const { data, error } = await AuthService.login($scope.username, $scope.password);
        if (error) throw new Error(error.message || '登录失败');
    
        const expiresAt = Date.now() + 3600000; // 会话过期时间：1小时
        const { data: bookmarks, error: bookmarkError } = await BookmarkService.getBookmarks(data.user.id);
        if (bookmarkError) throw new Error(bookmarkError.message || '书签加载失败');

        localStorage.setItem('rememberedEmail', $scope.username);

        $scope.$apply(() => {
          $scope.currentUser = data.user;
          $scope.bookmarks = bookmarks || [];
          $scope.isLoggedIn = true;
          $scope.sessionExpiresAt = expiresAt;
          $scope.message = '';
        });
      } catch (error) {
        $scope.$apply(() => {
          $scope.message = error.message || '登录失败';
        });
      }
    };

    // 书签增删改
    $scope.addBookmark = async function(event) {
      if (event) event.preventDefault();
      if (!$scope.currentUser) {
        $scope.bookmarkMessage = '请先登录';
        return;
      }
      const title = ($scope.newBookmark.title || '').trim();
      const url = normalizeUrl($scope.newBookmark.url);
      if (!title || !url) {
        $scope.bookmarkMessage = '请填写有效的书签名称和链接';
        return;
      }

      try {
        const { data, error } = await BookmarkService.addBookmark($scope.currentUser.id, title, url);
        if (error) throw new Error(error.message || '添加书签失败');
        if (data && data.length > 0) {
          const newItem = data[0];
          $scope.$apply(() => {
            $scope.bookmarks.unshift(newItem);
            $scope.newBookmark = { title: '', url: '' };
            $scope.bookmarkMessage = '已成功添加书签';
          });
        }
      } catch (err) {
        $scope.$apply(() => {
          $scope.bookmarkMessage = err.message || '添加书签失败';
        });
      }
    };

    $scope.startEdit = function(bookmark) {
      bookmark.editing = true;
      bookmark.editTitle = bookmark.title;
      bookmark.editUrl = bookmark.url;
      $scope.bookmarkMessage = '';
    };

    $scope.cancelEdit = function(bookmark) {
      bookmark.editing = false;
      bookmark.editTitle = undefined;
      bookmark.editUrl = undefined;
      $scope.bookmarkMessage = '';
    };

    $scope.updateBookmark = async function(bookmark) {
      if (!bookmark || !bookmark.id) return;
      const title = (bookmark.editTitle || '').trim();
      const url = normalizeUrl(bookmark.editUrl);
      if (!title || !url) {
        $scope.bookmarkMessage = '请填写有效的书签名称和链接';
        return;
      }

      try {
        const { data, error } = await BookmarkService.updateBookmark(bookmark.id, title, url);
        if (error) throw new Error(error.message || '更新书签失败');
        if (data && data.length > 0) {
          $scope.$apply(() => {
            bookmark.title = data[0].title;
            bookmark.url = data[0].url;
            bookmark.editing = false;
            $scope.bookmarkMessage = '已成功更新书签';
          });
        }
      } catch (err) {
        $scope.$apply(() => {
          $scope.bookmarkMessage = err.message || '更新书签失败';
        });
      }
    };

    $scope.deleteBookmark = async function(bookmark) {
      if (!bookmark || !bookmark.id) return;
      const should = window.confirm('确定要删除该书签吗？');
      if (!should) return;
      try {
        const { error } = await BookmarkService.deleteBookmark(bookmark.id);
        if (error) throw new Error(error.message || '删除书签失败');
        $scope.$apply(() => {
          $scope.bookmarks = $scope.bookmarks.filter(item => item.id !== bookmark.id);
          $scope.bookmarkMessage = '已删除书签';
        });
      } catch (err) {
        $scope.$apply(() => {
          $scope.bookmarkMessage = err.message || '删除书签失败';
        });
      }
    };
    
    // 定期检查会话状态（每5分钟）
    const sessionCheckInterval = setInterval(() => {
      if ($scope.isLoggedIn) {
        checkSession();
      }
    }, 300000);

    // 注销 interval，防止内存泄漏
    $scope.$on('$destroy', () => {
      if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    });
  }
]);
